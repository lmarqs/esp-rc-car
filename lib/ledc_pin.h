#pragma once

#ifdef ESP32
#include <Arduino.h>

#include "pin.h"

class EspLedcOutPin : public PwmOutPin {
 private:
  uint8_t pin;
  uint8_t channel;
  uint32_t requestedFrequency;
  uint32_t actualFrequency = 0;
  uint8_t resolution;

 public:
  EspLedcOutPin(uint8_t pin, uint8_t channel, uint32_t frequency, uint8_t resolution);
  bool begin();
  void write(uint16_t duty);
  uint32_t frequency();
};
#endif
