#include "h_bridge.h"

#include <Arduino.h>

void HBridge::noSignal(uint8_t whenToStop) {
  if (noSignalCount++ >= whenToStop) {
    stop();
  }
}

void HBridge::signal() { noSignalCount = 0; }

void HBridge::move(int32_t value) {
  if (value > 0) {
    forward(value);
  } else if (value < 0) {
    backward(-value);
  } else {
    stop();
  }
}

FullHBridge::FullHBridge(PwmOutPin* pwm, OutPin* in1, OutPin* in2) {
  this->pwm = pwm;
  this->in1 = in1;
  this->in2 = in2;
}

bool FullHBridge::begin() {
  in1->begin();
  in2->begin();
  return pwm->begin();
}

void FullHBridge::forward(int32_t value) {
  HBridge::signal();

  in1->write(HIGH);
  in2->write(LOW);
  pwm->write(constrain(value, 0, PwmOutPin::DUTY_MAX));
}

void FullHBridge::backward(int32_t value) {
  HBridge::signal();

  in1->write(LOW);
  in2->write(HIGH);
  pwm->write(constrain(value, 0, PwmOutPin::DUTY_MAX));
}

void FullHBridge::stop() {
  HBridge::signal();

  in1->write(LOW);
  in2->write(LOW);
  pwm->write(0);
}

HalfHBridge::HalfHBridge(PwmOutPin* in1, PwmOutPin* in2) {
  this->in1 = in1;
  this->in2 = in2;
}

bool HalfHBridge::begin() { return in1->begin() && in2->begin(); }

void HalfHBridge::forward(int32_t value) {
  HBridge::signal();

  in1->write(constrain(value, 0, PwmOutPin::DUTY_MAX));
  in2->write(0);
}

void HalfHBridge::backward(int32_t value) {
  HBridge::signal();

  in1->write(0);
  in2->write(constrain(value, 0, PwmOutPin::DUTY_MAX));
}

void HalfHBridge::stop() {
  HBridge::signal();

  in1->write(0);
  in2->write(0);
}
