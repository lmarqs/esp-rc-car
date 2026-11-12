#include <Arduino.h>
#include <Preferences.h>
#include <Wire.h>
#include <esc.h>
#include <imu.h>
#include <ledc_pin.h>

#include "./balancer.h"
#include "./config.h"
#include "./config_command.h"
#include "./tuning_server.h"

// 14 bits is the finest LEDC resolution the ESP32-C3 has, and at 200 Hz one step of it is 0.3 µs. The ESCs take
// a fresh pulse on every step of the 200 Hz control loop.
const uint32_t ESC_HZ = 200;
const uint8_t ESC_RESOLUTION = 14;
const uint32_t ESC_ARM_MS = 3000;

// Above the HTTP server's priority of 5, so control preempts it on the single-core C3, and below lwIP's 18 and
// WiFi's 23, so the WiFi stack is never starved.
const UBaseType_t CONTROL_PRIORITY = 10;
const uint32_t CONTROL_STACK_BYTES = 8192;

static EspLedcOutPin escPin1(ESC_1_PIN, ESC_HZ, ESC_RESOLUTION);
static EspLedcOutPin escPin2(ESC_2_PIN, ESC_HZ, ESC_RESOLUTION);
static Esc esc1(&escPin1);
static Esc esc2(&escPin2);
static Mpu6050Imu imu(&Wire);
// Rebuilt in setup() from the settings, which the board reads from flash. Until then it holds a band of 0.
static Balancer balancer(ComplementaryFilter(FILTER_ALPHA), PidController({KP, KI, KD}, 0.0f, 0.0f),
                         Mixer(0.0f, 0.0f, 0.0f), 0.0f);

static const char* const NVS_NAMESPACE = "bbcfg";
// NVS keys are at most 15 characters, which angle_offset_deg exceeds, so they differ from the protocol's keys.
static const char* const NVS_KEYS[CONFIG_FIELD_COUNT] = {"ap_ssid", "ap_pass", "angle_off", "thr_min",
                                                         "thr_mid", "thr_max", "tilt_lim"};

static const ConfigDefaults CONFIG_DEFAULTS{DEFAULT_AP_SSID,       DEFAULT_AP_PASSWORD,  DEFAULT_ANGLE_OFFSET_DEG,
                                            DEFAULT_THROTTLE_MIN,  DEFAULT_THROTTLE_MID, DEFAULT_THROTTLE_MAX,
                                            DEFAULT_TILT_LIMIT_DEG};

static StoredConfig storedConfig = emptyConfig();
// Written in setup() before the control task starts, and only read after.
static BoardSettings settings;
static ConfigLineReader serialLine;

// Only the control task touches these.
static PidGains gains{KP, KI, KD};
static float setpoint = SETPOINT_DEG;
static bool enabled = false;
static BalancerOutputs last{};

#if BALANCE_BEAM_BENCH_ENABLED
static bool benchActive = false;
static bool motorsOn = false;
static float m1Speed = 0.0f, m2Speed = 0.0f;
#endif

static void step(float dt) {
#if BALANCE_BEAM_BENCH_ENABLED
  if (benchActive) {
    esc1.write(motorsOn ? m1Speed : 0.0f);
    esc2.write(motorsOn ? m2Speed : 0.0f);
    // The page shows the bench state, so it never looks safe while the motors run.
    tuningServerPublish(last.angle, enabled, false, true, gains, setpoint);
    return;
  }
#endif

  tuningServerPoll(gains, setpoint, settings.tiltLimitDeg);
  const int arm = tuningServerPollArm();
  if (arm >= 0) {
    enabled = arm == 1;
  }

  ImuSample sample;
  if (!imu.read(sample)) {
    return;
  }

  // The beam pivots around the sensor's Z axis: level, gravity lies on +X, and tilting swings it into Y. The Z rate
  // is negated to agree in sign with that angle. Both depend on how the sensor is mounted.
  const float accelAngle = atan2f(sample.ay, sample.ax) * RAD_TO_DEG - settings.angleOffsetDeg;
  balancer.setGains(gains);
  last = balancer.step({accelAngle, -sample.gz, setpoint, dt, enabled});

  esc1.write(last.active ? last.m1 : 0.0f);
  esc2.write(last.active ? last.m2 : 0.0f);
  if (last.tripped) {
    enabled = false;
  }

#if CORE_DEBUG_LEVEL >= 4
  static uint8_t n = 0;
  if (++n >= 20) {
    n = 0;
    log_d("ax=%+.3f ay=%+.3f az=%+.3f | gx=%+.2f gy=%+.2f gz=%+.2f | acc=%+.1f fused=%+.1f", sample.ax, sample.ay,
          sample.az, sample.gx, sample.gy, sample.gz, accelAngle, last.angle);
    log_d("control: core=%d stack_free=%u words", xPortGetCoreID(), uxTaskGetStackHighWaterMark(nullptr));
  }
#endif

  tuningServerPublish(last.angle, enabled, last.tripped, false, gains, setpoint);
}

static void handleCommand(String line) {
  line.trim();
  if (line.length() == 0) {
    return;
  }

  if (line == "?") {
#if BALANCE_BEAM_BENCH_ENABLED
    if (benchActive) {
      log_i("state: BENCH motors=%s m1=%.3f m2=%.3f sp=%.2f kp=%.4f ki=%.4f kd=%.4f", motorsOn ? "ON" : "off", m1Speed,
            m2Speed, setpoint, gains.kp, gains.ki, gains.kd);
      return;
    }
#endif
    log_i("state: %s%s angle=%.2f sp=%.2f out=%.3f m1=%.2f m2=%.2f kp=%.4f ki=%.4f kd=%.4f",
          enabled ? "ARMED" : "disarmed", last.tripped ? " TRIPPED" : "", last.angle, setpoint, last.correction,
          last.m1, last.m2, gains.kp, gains.ki, gains.kd);
  }
#if BALANCE_BEAM_BENCH_ENABLED
  else if (line.startsWith("set motors_enabled ")) {
    String value = line.substring(19);
    value.trim();
    value.toLowerCase();
    if (value == "on" || value == "1" || value == "true") {
      benchActive = true;
      motorsOn = true;
      log_w("motors ENABLED (propellers off!): m1=%.3f m2=%.3f", m1Speed, m2Speed);
    } else if (value == "off" || value == "0" || value == "false") {
      benchActive = true;
      motorsOn = false;
      log_i("motors idle. 'run' resumes balancing.");
    } else {
      log_w("usage: set motors_enabled on|off");
    }
  } else if (line.startsWith("set motors_speed ")) {
    String rest = line.substring(17);
    rest.trim();
    const int gap = rest.indexOf(' ');
    if (gap < 0) {
      log_w("usage: set motors_speed <m1> <m2>, each from 0 to 1");
    } else {
      m1Speed = constrain(rest.substring(0, gap).toFloat(), 0.0f, 1.0f);
      m2Speed = constrain(rest.substring(gap + 1).toFloat(), 0.0f, 1.0f);
      log_i("motors_speed m1=%.4f (%.2f us) m2=%.4f (%.2f us)%s", m1Speed, esc1.pulseUs(m1Speed), m2Speed,
            esc2.pulseUs(m2Speed), motorsOn ? "" : ", enable with 'set motors_enabled on'");
    }
  } else if (line == "run") {
    benchActive = false;
    log_i("bench off, balancing");
  } else if (line == "x") {
    benchActive = true;
    motorsOn = false;
    log_w("STOP: motors idle. 'run' resumes balancing.");
  }
#endif
  else if (line.startsWith("kp ")) {
    gains.kp = line.substring(3).toFloat();
  } else if (line.startsWith("ki ")) {
    gains.ki = line.substring(3).toFloat();
  } else if (line.startsWith("kd ")) {
    gains.kd = line.substring(3).toFloat();
  } else if (line.startsWith("sp ")) {
    setpoint = line.substring(3).toFloat();
  } else {
#if BALANCE_BEAM_BENCH_ENABLED
    log_w(
        "commands: kp <v> | ki <v> | kd <v> | sp <v> | ? | set motors_enabled on|off | set motors_speed <m1> <m2> "
        "| run | x");
#else
    log_w("commands: kp <v> | ki <v> | kd <v> | sp <v> | ?");
#endif
  }
}

static void loadConfig() {
  Preferences prefs;
  if (!prefs.begin(NVS_NAMESPACE)) {
    log_e("the stored settings are unreadable, so the defaults apply");
    return;
  }
  for (int i = 0; i < CONFIG_FIELD_COUNT; i++) {
    const ConfigField field = static_cast<ConfigField>(i);
    if (!prefs.isKey(NVS_KEYS[field])) {
      continue;
    }
    bool kept;
    if (configFieldIsText(field)) {
      char text[CONFIG_PASSWORD_MAX + 2];
      text[0] = '\0';
      prefs.getString(NVS_KEYS[field], text, sizeof(text));
      kept = restoreText(storedConfig, field, text);
    } else {
      kept = restoreNumber(storedConfig, field, prefs.getFloat(NVS_KEYS[field], NAN));
    }
    if (!kept) {
      log_w("the stored %s is invalid and ignored", configKey(field));
    }
  }
  prefs.end();
}

static void saveConfig(ConfigField field) {
  Preferences prefs;
  if (!prefs.begin(NVS_NAMESPACE)) {
    log_e("the %s could not be saved", configKey(field));
    return;
  }
  const bool saved = configFieldIsText(field) ? prefs.putString(NVS_KEYS[field], storedText(storedConfig, field)) > 0
                                              : prefs.putFloat(NVS_KEYS[field], storedNumber(storedConfig, field)) > 0;
  prefs.end();
  if (!saved) {
    log_e("the %s could not be saved", configKey(field));
  }
}

// Settings are read at boot, so a new value takes effect after `cfg restart`. The reply goes out raw, a line the
// page recognizes by its "cfg " start, and not through the log.
static void handleConfigCommand(const char* line) {
  // A save blocks the control task, so no set is accepted while the motors can run, balancing or on the bench.
#if BALANCE_BEAM_BENCH_ENABLED
  const bool motorsCanRun = enabled || (benchActive && motorsOn);
#else
  const bool motorsCanRun = enabled;
#endif
  char reply[CONFIG_REPLY_MAX];
  const ConfigResult result = handleConfigLine(line, storedConfig, CONFIG_DEFAULTS, motorsCanRun, reply, sizeof(reply));
  if (result.action == ConfigAction::Save) {
    saveConfig(result.field);
  }
  Serial.print(reply);
  if (result.action == ConfigAction::Restart) {
    // The ESCs get the minimum pulse for a control period first, so a restart never cuts the signal while they run.
    esc1.write(0.0f);
    esc2.write(0.0f);
    vTaskDelay(pdMS_TO_TICKS(1000UL / LOOP_HZ));
    Serial.flush();
    ESP.restart();
  }
}

static void pollSerial() {
  while (Serial.available()) {
    if (serialLine.feed(static_cast<char>(Serial.read()))) {
      if (isConfigLine(serialLine.line())) {
        handleConfigCommand(serialLine.line());
      } else {
        handleCommand(serialLine.line());
      }
    }
  }
}

// The PID's output reaches from the middle throttle to the farther edge of the band; the mixer clamps at the nearer.
static float pidOutputLimit(const BoardSettings& s) {
  return fmaxf(s.throttleMax - s.throttleMid, s.throttleMid - s.throttleMin);
}

static void controlTask(void*) {
  TickType_t nextWake = xTaskGetTickCount();
  uint32_t lastUs = micros();
  log_i("control task on core %d", xPortGetCoreID());

  for (;;) {
    // Sleeping until the next period lets the idle task run, which feeds the task watchdog. When a step overran,
    // xTaskDelayUntil returns at once without sleeping, so the task yields by hand.
    if (xTaskDelayUntil(&nextWake, pdMS_TO_TICKS(1000UL / LOOP_HZ)) == pdFALSE) {
      taskYIELD();
    }

    pollSerial();

    const uint32_t now = micros();
    const float dt = (now - lastUs) * 1e-6f;
    lastUs = now;
    step(dt);
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.setDebugOutput(true);
  log_i("boot, disarmed. Arm from the page; the ESCs' supply has its own switch.");

  loadConfig();
  settings = activeSettings(storedConfig, CONFIG_DEFAULTS);
  if (settings.bandRejected) {
    log_e("the throttles break 0 <= min <= mid <= max <= 1, so the band is 0 and no motor spins");
  }
  log_i("settings: angle_offset=%.3f throttle=%.3f/%.3f/%.3f tilt_limit=%.3f", settings.angleOffsetDeg,
        settings.throttleMin, settings.throttleMid, settings.throttleMax, settings.tiltLimitDeg);
  const float outLimit = pidOutputLimit(settings);
  balancer = Balancer(ComplementaryFilter(FILTER_ALPHA), PidController({KP, KI, KD}, -outLimit, outLimit),
                      Mixer(settings.throttleMid, settings.throttleMin, settings.throttleMax), settings.tiltLimitDeg);

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(400000);
  // A stalled read fails within 10 ms and costs one step, where a hang would trip the watchdog.
  Wire.setTimeOut(10);
  if (imu.begin()) {
    log_i("MPU6050 ready");
  } else {
    log_e("MPU6050 not found");
  }

  if (!esc1.begin() || !esc2.begin()) {
    log_e("an ESC pin has no LEDC channel");
  }
  // An ESC arms after it has seen the minimum pulse for a few seconds.
  delay(ESC_ARM_MS);
  log_i("ESCs armed and idle");

  tuningServerBegin(settings.apSsid, settings.apPassword);

  // The control loop gets its own task on the core Arduino runs on: core 1 on a dual-core chip, away from the WiFi
  // stack on core 0, and the only core on the C3. setup() runs in the Arduino loop task, which is deleted since
  // loop() has nothing to do.
  xTaskCreatePinnedToCore(controlTask, "control", CONTROL_STACK_BYTES, nullptr, CONTROL_PRIORITY, nullptr,
                          ARDUINO_RUNNING_CORE);
  vTaskDelete(nullptr);
}

void loop() {}
