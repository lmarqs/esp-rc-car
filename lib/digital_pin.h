#pragma once

#include <Arduino.h>

#include "pin.h"

class DigitalInPin : public InPin {
 private:
  uint8_t pin;

 public:
  DigitalInPin(uint8_t pin);
  void begin();
  uint32_t read();
};

/** A pin that is on or off. Its active level is the one that turns its load on, HIGH unless the board wires it LOW. */
class DigitalOutPin : public OutPin {
 private:
  uint8_t pin;
  uint8_t activeLevel;

 public:
  DigitalOutPin(uint8_t pin, uint8_t activeLevel = HIGH);
  /** Makes the pin an output and turns it off. */
  void begin();
  /** Turns the pin on for any value but 0. */
  void write(uint32_t value);
};
