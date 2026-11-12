#include <Arduino.h>
#include <ArduinoOTA.h>
#include <EEPROM.h>
#include <board_led.h>
#include <digital_pin.h>
#include <serial_io.h>

#if defined(ESP8266)
#include <ESP8266WebServer.h>
#include <ESP8266WiFi.h>
using HttpServer = ESP8266WebServer;
#elif defined(ESP32)
#include <WebServer.h>
#include <WiFi.h>
using HttpServer = WebServer;
#endif

#include "./blink_controller.h"
#include "./blink_setting.h"
#include "./blink_setting_update.h"
#include "./config_command.h"
#include "./data/index.html.h"

#if __has_include("local.h")
#include "local.h"
#endif

#ifndef WEB_RELAY_AP_SSID
#define WEB_RELAY_AP_SSID "web-relay"
#endif
// WPA2 refuses a password shorter than 8 characters, and the hotspot then comes up open.
#ifndef WEB_RELAY_AP_PASSWORD
#define WEB_RELAY_AP_PASSWORD "web-relay-1234"
#endif
#ifndef WEB_RELAY_OTA_PASSWORD
#define WEB_RELAY_OTA_PASSWORD "web-relay-1234"
#endif

#if defined(ESP8266)
// ESP-01S: GPIO0 drives the relay and is a boot strap, where LOW at reset enters flash mode.
static DigitalOutPin relay(0, LOW);
#elif defined(ESP32)
// ESP32 DevKit: GPIO23 stays LOW at boot, so the relay does not click during reset or flashing.
static DigitalOutPin relay(23, HIGH);
#endif
static BoardLed led;

// The blink setting sits at 0 and the serial settings after it, with room left for a record to grow.
static const size_t EEPROM_SIZE = 256;
static const size_t BLINK_SETTING_OFFSET = 0;
static const size_t CONFIG_OFFSET = 16;
static_assert(CONFIG_OFFSET >= BLINK_SETTING_OFFSET + sizeof(BlinkSetting),
              "the serial settings overlap the blink setting");
static_assert(CONFIG_OFFSET + sizeof(StoredConfig) <= EEPROM_SIZE, "the serial settings do not fit in the EEPROM");

static const ConfigDefaults CONFIG_DEFAULTS{WEB_RELAY_AP_SSID, WEB_RELAY_AP_PASSWORD, WEB_RELAY_OTA_PASSWORD};

static BlinkController blinker;
static StoredConfig config = emptyConfig();
static SerialInput serialInput;
static SerialOutput serialOutput;
static HttpServer server(80);

static void applyOutput() {
  const bool on = blinker.output().isOn();
  relay.write(on);
  led.write(on);
}

static void logLamp() { serialOutput.printf("lamp %s\n", blinker.output().name()); }

static void tick() {
  if (!blinker.update(millis())) {
    return;
  }
  applyOutput();
  logLamp();
}

static void loadSetting() {
  BlinkSetting s{};
  EEPROM.get(BLINK_SETTING_OFFSET, s);
  applyBlinkSetting(s, blinker);
}

static void saveSetting() {
  const BlinkSetting s = blinkSettingFrom(blinker);
  EEPROM.put(BLINK_SETTING_OFFSET, s);
  EEPROM.commit();
}

static void loadConfig() {
  StoredConfig raw{};
  EEPROM.get(CONFIG_OFFSET, raw);
  config = storedConfigFrom(raw);
}

static void saveConfig() {
  EEPROM.put(CONFIG_OFFSET, config);
  EEPROM.commit();
}

// Serial settings are read at boot, so a new value takes effect after `cfg restart`.
static void handleSerialLine(const char* line) {
  char reply[CONFIG_REPLY_MAX];
  const ConfigAction action = handleConfigLine(line, config, CONFIG_DEFAULTS, reply, sizeof(reply));
  if (action == ConfigAction::Save) {
    saveConfig();
  }
  serialOutput.print(reply);
  switch (action) {
    case ConfigAction::Restart:
      serialOutput.flush();
      ESP.restart();
      break;
    default:
      break;
  }
}

static void readSerial() {
  while (serialInput.ready()) {
    handleSerialLine(serialInput.take().c_str());
  }
}

static void sendStatus() {
  char body[96];
  statusJson(blinker, body, sizeof(body));
  server.send(200, "application/json", body);
}

static void handleIndex() {
  server.send_P(200, "text/html", reinterpret_cast<const char*>(data_index_html), data_index_html_len);
}

// The setting is written to flash only when it changed, since each write wears the flash.
static void respondToCommand(BlinkOutcome outcome, const char* errorBody) {
  switch (outcome) {
    case BlinkOutcome::Rejected:
      server.send(400, "application/json", errorBody);
      return;
    case BlinkOutcome::Accepted:
      applyOutput();
      logLamp();
      saveSetting();
      break;
    case BlinkOutcome::Unchanged:
      break;
  }

  sendStatus();
}

static void handleMode() {
  respondToCommand(applyMode(blinker, server.arg("mode").c_str(), millis()),
                   "{\"error\":\"mode must be blink|on|off\"}");
}

static void handlePeriod() {
  respondToCommand(applyPeriod(blinker, server.arg("period").c_str(), millis()),
                   "{\"error\":\"period must be a positive integer\"}");
}

void setup() {
  // The outputs go off before anything else, since on the ESP-01S they share the boot strap pins.
  relay.begin();
  led.begin();

  serialOutput.begin("web-relay");
  EEPROM.begin(EEPROM_SIZE);
  loadSetting();
  loadConfig();

  const char* apSsid = effectiveApSsid(config, CONFIG_DEFAULTS);
  WiFi.mode(WIFI_AP);
  WiFi.softAP(apSsid, effectiveApPassword(config, CONFIG_DEFAULTS));
  serialOutput.printf("\nAP \"%s\" up at %s\n", apSsid, WiFi.softAPIP().toString().c_str());

  ArduinoOTA.setPassword(effectiveOtaPassword(config, CONFIG_DEFAULTS));
  ArduinoOTA.begin();

  server.on("/", HTTP_GET, handleIndex);
  server.on("/status", HTTP_GET, sendStatus);
  server.on("/mode", HTTP_POST, handleMode);
  server.on("/period", HTTP_POST, handlePeriod);
  server.onNotFound([]() { server.send(404, "text/plain", "not found"); });
  server.begin();
}

void loop() {
  ArduinoOTA.handle();
  server.handleClient();
  readSerial();
  tick();
}
