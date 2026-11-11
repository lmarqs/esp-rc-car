#pragma once

#include <Arduino.h>
#include "this_pin.h"

class EspLedcOutPin : public OutPin {
 private:
  uint8_t pin;
  uint8_t channel;
  uint32_t frequency;
  uint8_t resolution;

 public:
  EspLedcOutPin(uint8_t pin, uint8_t channel, uint32_t frequency, uint8_t resolution);
  void begin();
  void write(uint32_t value);
};
