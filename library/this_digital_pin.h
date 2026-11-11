#pragma once

#include <Arduino.h>

#include "this_pin.h"

class DigitalInPin : public InPin {
 private:
  uint8_t pin;

 public:
  DigitalInPin(uint8_t pin);
  void begin();
  uint32_t read();
};

class DigitalOutPin : public OutPin {
 private:
  uint8_t pin;

 public:
  DigitalOutPin(uint8_t pin);
  void begin();
  void write(uint32_t value);
};
