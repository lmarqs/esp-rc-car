#ifdef ESP32
#include "ledc_pin.h"

#include <Arduino.h>
#include <esp32-hal-ledc.h>

EspLedcOutPin::EspLedcOutPin(uint8_t pin, uint8_t channel, uint32_t frequency, uint8_t resolution) {
  this->pin = pin;
  this->channel = channel;
  this->requestedFrequency = frequency;
  this->resolution = resolution;
}

bool EspLedcOutPin::begin() {
  pinMode(pin, OUTPUT);

  actualFrequency = ledcSetup(channel, requestedFrequency, resolution);

  if (!actualFrequency) {
    log_e("LEDC channel %u cannot run at %u Hz with %u bits", channel, requestedFrequency, resolution);
    return false;
  }

  ledcAttachPin(pin, channel);
  return true;
}

void EspLedcOutPin::write(uint16_t duty) {
  if (!actualFrequency) {
    return;
  }

  ledcWrite(channel, ((uint64_t)duty << resolution) / DUTY_MAX);
}

uint32_t EspLedcOutPin::frequency() { return actualFrequency; }
#endif
