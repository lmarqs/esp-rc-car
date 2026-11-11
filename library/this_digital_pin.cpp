#include <Arduino.h>
#include "this_digital_pin.h"

DigitalInPin::DigitalInPin(uint8_t pin) {
  this->pin = pin;
}

void DigitalInPin::begin() {
  pinMode(this->pin, INPUT);
}

uint32_t DigitalInPin::read() {
  return digitalRead(this->pin);
}

DigitalOutPin::DigitalOutPin(uint8_t pin) {
  this->pin = pin;
}

void DigitalOutPin::begin() {
  pinMode(this->pin, OUTPUT);
  digitalWrite(this->pin, 0);
}

void DigitalOutPin::write(uint32_t value) {
  digitalWrite(this->pin, value);
}
