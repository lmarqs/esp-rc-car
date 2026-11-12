#include "digital_pin.h"

#include <Arduino.h>

DigitalInPin::DigitalInPin(uint8_t pin) { this->pin = pin; }

void DigitalInPin::begin() { pinMode(this->pin, INPUT); }

uint32_t DigitalInPin::read() { return digitalRead(this->pin); }

DigitalOutPin::DigitalOutPin(uint8_t pin, uint8_t activeLevel) {
  this->pin = pin;
  this->activeLevel = activeLevel;
}

void DigitalOutPin::begin() {
  pinMode(this->pin, OUTPUT);
  write(0);
}

void DigitalOutPin::write(uint32_t value) {
  const uint8_t inactiveLevel = activeLevel == HIGH ? LOW : HIGH;
  digitalWrite(this->pin, value != 0 ? activeLevel : inactiveLevel);
}
