#ifdef ESP32
#include <Arduino.h>
#include <esp32-hal-ledc.h>

#include "this_esp_ledc_pin.h"

EspLedcOutPin::EspLedcOutPin(uint8_t pin, uint8_t channel, uint32_t frequency, uint8_t resolution) {
  this->pin = pin;
  this->channel = channel;
  this->frequency = frequency;
  this->resolution = resolution;
}

void EspLedcOutPin::begin() {
  pinMode(pin, OUTPUT);

  ledcSetup(channel, frequency, resolution);

  ledcAttachPin(pin, channel);
}

void EspLedcOutPin::write(uint32_t duty) { ledcWrite(channel, duty); }
#endif
