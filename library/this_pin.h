#pragma once

#include <Arduino.h>

class InPin {
 public:
  virtual void begin();
  virtual uint32_t read();
};

class OutPin {
 public:
  virtual void begin();
  virtual void write(uint32_t value);
};
