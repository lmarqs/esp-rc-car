#include "tuning_server.h"

#include <Arduino.h>
#include <WiFi.h>
#include <esp_http_server.h>

#include "./config.h"
#include "./data/index.html.h"

struct Shared {
  PidGains commandGains{KP, KI, KD};
  float commandSetpoint = SETPOINT_DEG;
  bool commandPending = false;
  int commandArm = -1;

  float angle = 0.0f;
  bool enabled = false;
  bool tripped = false;
  bool bench = false;
  PidGains gains{KP, KI, KD};
  float setpoint = SETPOINT_DEG;
};

// The HTTP handlers and the control loop run in different tasks. Each critical section copies a few scalars, so
// neither stalls the other.
static portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
static Shared shared;
static httpd_handle_t server = nullptr;

static esp_err_t indexHandler(httpd_req_t* req) {
  httpd_resp_set_type(req, "text/html");
  return httpd_resp_send(req, reinterpret_cast<const char*>(data_index_html), data_index_html_len);
}

static esp_err_t telemetryHandler(httpd_req_t* req) {
  taskENTER_CRITICAL(&mux);
  const Shared s = shared;
  taskEXIT_CRITICAL(&mux);

  char buf[256];
  const int n = snprintf(buf, sizeof(buf),
                         "{\"angle\":%.2f,\"enabled\":%s,\"tripped\":%s,\"bench\":%s,"
                         "\"kp\":%.5f,\"ki\":%.5f,\"kd\":%.5f,\"sp\":%.2f}",
                         s.angle, s.enabled ? "true" : "false", s.tripped ? "true" : "false",
                         s.bench ? "true" : "false", s.gains.kp, s.gains.ki, s.gains.kd, s.setpoint);
  if (n < 0 || n >= static_cast<int>(sizeof(buf))) {
    httpd_resp_send_500(req);
    return ESP_FAIL;
  }
  httpd_resp_set_type(req, "application/json");
  return httpd_resp_send(req, buf, n);
}

static bool queryFloat(const char* query, const char* key, float& value) {
  char text[32];
  if (httpd_query_key_value(query, key, text, sizeof(text)) != ESP_OK) {
    return false;
  }
  value = atof(text);
  return true;
}

// GET /set?kp=&ki=&kd=&sp=&en=, with any of the keys.
static esp_err_t setHandler(httpd_req_t* req) {
  char query[128];
  if (httpd_req_get_url_query_str(req, query, sizeof(query)) == ESP_OK) {
    // Parsed before the critical section, which runs with interrupts off.
    float kp, ki, kd, sp, en;
    const bool hasKp = queryFloat(query, "kp", kp);
    const bool hasKi = queryFloat(query, "ki", ki);
    const bool hasKd = queryFloat(query, "kd", kd);
    const bool hasSp = queryFloat(query, "sp", sp);
    const bool hasEn = queryFloat(query, "en", en);

    taskENTER_CRITICAL(&mux);
    if (hasKp) shared.commandGains.kp = kp;
    if (hasKi) shared.commandGains.ki = ki;
    if (hasKd) shared.commandGains.kd = kd;
    if (hasSp) shared.commandSetpoint = sp;
    if (hasKp || hasKi || hasKd || hasSp) shared.commandPending = true;
    if (hasEn) shared.commandArm = en != 0.0f ? 1 : 0;
    taskEXIT_CRITICAL(&mux);
  }
  return httpd_resp_sendstr(req, "ok");
}

static void onWifiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  if (event == ARDUINO_EVENT_WIFI_AP_STACONNECTED) {
    const uint8_t* m = info.wifi_ap_staconnected.mac;
    log_i("AP client joined %02x:%02x:%02x:%02x:%02x:%02x", m[0], m[1], m[2], m[3], m[4], m[5]);
  } else if (event == ARDUINO_EVENT_WIFI_AP_STADISCONNECTED) {
    const uint8_t* m = info.wifi_ap_stadisconnected.mac;
    log_i("AP client left %02x:%02x:%02x:%02x:%02x:%02x", m[0], m[1], m[2], m[3], m[4], m[5]);
  }
}

static void registerUri(const char* path, esp_err_t (*handler)(httpd_req_t*)) {
  httpd_uri_t uri = {};
  uri.uri = path;
  uri.method = HTTP_GET;
  uri.handler = handler;
  httpd_register_uri_handler(server, &uri);
}

bool tuningServerBegin(const char* apSsid, const char* apPassword) {
  WiFi.onEvent(onWifiEvent);
  WiFi.mode(WIFI_AP);

  const bool secured = strlen(apPassword) >= 8;
  if (strlen(apPassword) > 0 && !secured) {
    log_w("the hotspot password is shorter than 8 characters, so the hotspot is open");
  }
  if (!(secured ? WiFi.softAP(apSsid, apPassword) : WiFi.softAP(apSsid))) {
    log_e("the hotspot failed to start");
    return false;
  }

  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  // Core 0 runs the WiFi stack, and on a dual-core chip the control task has core 1 to itself.
  config.core_id = 0;
  config.lru_purge_enable = true;
  if (httpd_start(&server, &config) != ESP_OK) {
    log_e("the HTTP server failed to start");
    return false;
  }
  registerUri("/", indexHandler);
  registerUri("/telemetry", telemetryHandler);
  registerUri("/set", setHandler);

  log_i("page on %s hotspot '%s' at http://%s/", secured ? "WPA2" : "open", apSsid, WiFi.softAPIP().toString().c_str());
  return true;
}

void tuningServerPublish(float angle, bool enabled, bool tripped, bool bench, PidGains gains, float setpoint) {
  taskENTER_CRITICAL(&mux);
  shared.angle = angle;
  shared.enabled = enabled;
  shared.tripped = tripped;
  shared.bench = bench;
  shared.gains = gains;
  shared.setpoint = setpoint;
  taskEXIT_CRITICAL(&mux);
}

bool tuningServerPoll(PidGains& gains, float& setpoint, float tiltLimitDeg) {
  taskENTER_CRITICAL(&mux);
  const bool pending = shared.commandPending;
  const PidGains commandGains = shared.commandGains;
  const float commandSetpoint = shared.commandSetpoint;
  shared.commandPending = false;
  taskEXIT_CRITICAL(&mux);

  if (!pending) {
    return false;
  }
  gains = commandGains;
  setpoint = constrain(commandSetpoint, -tiltLimitDeg, tiltLimitDeg);
  return true;
}

int tuningServerPollArm() {
  taskENTER_CRITICAL(&mux);
  const int request = shared.commandArm;
  shared.commandArm = -1;
  taskEXIT_CRITICAL(&mux);
  return request;
}
