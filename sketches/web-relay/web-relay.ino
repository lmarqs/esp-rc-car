#include <Arduino.h>
#include <ArduinoOTA.h>
#include <EEPROM.h>

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

/** A digital output with the level that turns its load on, since carrier boards wire the relay either way. */
struct Output {
  uint8_t pin;
  uint8_t activeLevel;

  void begin() const {
    pinMode(pin, OUTPUT);
    write(false);
  }

  void write(bool on) const { digitalWrite(pin, on ? activeLevel : (activeLevel == HIGH ? LOW : HIGH)); }
};

#if defined(ESP8266)
// ESP-01S: GPIO0 drives the relay and is a boot strap, where LOW at reset enters flash mode. GPIO2 is the onboard
// LED, wired active-LOW.
static const Output relay{0, LOW};
static const Output led{2, LOW};
#elif defined(ESP32)
// ESP32 DevKit: GPIO23 stays LOW at boot, so the relay does not click during reset or flashing. GPIO2 is the
// onboard LED, active-HIGH.
static const Output relay{23, HIGH};
static const Output led{2, HIGH};
#endif

static const size_t EEPROM_SIZE = 64;

static BlinkController blinker;
static HttpServer server(80);

static void applyOutput() {
  const bool on = blinker.output().isOn();
  relay.write(on);
  led.write(on);
}

static void logLamp() { Serial.printf("lamp %s\n", blinker.output().name()); }

static void tick() {
  if (!blinker.update(millis())) {
    return;
  }
  applyOutput();
  logLamp();
}

static void loadSetting() {
  EEPROM.begin(EEPROM_SIZE);
  BlinkSetting s{};
  EEPROM.get(0, s);
  applyBlinkSetting(s, blinker);
}

static void saveSetting() {
  const BlinkSetting s = blinkSettingFrom(blinker);
  EEPROM.put(0, s);
  EEPROM.commit();
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

  Serial.begin(115200);
  loadSetting();

  WiFi.mode(WIFI_AP);
  WiFi.softAP(WEB_RELAY_AP_SSID, WEB_RELAY_AP_PASSWORD);
  Serial.printf("\nAP \"%s\" up at %s\n", WEB_RELAY_AP_SSID, WiFi.softAPIP().toString().c_str());

  ArduinoOTA.setPassword(WEB_RELAY_OTA_PASSWORD);
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
  tick();
}
