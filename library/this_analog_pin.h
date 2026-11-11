#pragma once

#include <Arduino.h>

#include "this_pin.h"

class AnalogInPin : public InPin {
 private:
  uint8_t pin;

 public:
  AnalogInPin(uint8_t pin);
  void begin();
  uint32_t read();
};

class AnalogOutPin : public OutPin {
 private:
  uint8_t pin;

 public:
  AnalogOutPin(uint8_t pin);
  void begin();
  void write(uint32_t value);
};
