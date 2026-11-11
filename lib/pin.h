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

/** A pin that outputs a square wave at a fixed frequency. */
class PwmOutPin {
 public:
  /** The duty that keeps the pin high for the whole period; 0 keeps it low. */
  static const uint16_t DUTY_MAX = 65535;

  /** Returns false when the pin cannot run, such as when no hardware channel is left. */
  virtual bool begin() = 0;
  virtual void write(uint16_t duty) = 0;
  /** The frequency the hardware runs at, in hertz, which can differ slightly from the one asked for. */
  virtual uint32_t frequency() = 0;
};
