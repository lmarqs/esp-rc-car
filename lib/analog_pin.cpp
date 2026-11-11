#include "analog_pin.h"

#include <Arduino.h>

AnalogInPin::AnalogInPin(uint8_t pin) { this->pin = pin; }

void AnalogInPin::begin() { pinMode(this->pin, INPUT); }

uint32_t AnalogInPin::read() { return analogRead(this->pin); }

AnalogOutPin::AnalogOutPin(uint8_t pin) { this->pin = pin; }

void AnalogOutPin::begin() {
  pinMode(this->pin, OUTPUT);
  analogWrite(this->pin, 0);
}

void AnalogOutPin::write(uint32_t value) { analogWrite(this->pin, value); }
