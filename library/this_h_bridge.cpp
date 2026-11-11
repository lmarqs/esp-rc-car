#include "this_h_bridge.h"

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

FullHBridge::FullHBridge(OutPin* pwm, OutPin* in1, OutPin* in2) {
  this->pwm = pwm;
  this->in1 = in1;
  this->in2 = in2;
}

void FullHBridge::begin() {
  pwm->begin();
  in1->begin();
  in2->begin();
}

void FullHBridge::forward(int32_t value) {
  HBridge::signal();

  in1->write(HIGH);
  in2->write(LOW);
  pwm->write(value);
}

void FullHBridge::backward(int32_t value) {
  HBridge::signal();

  in1->write(LOW);
  in2->write(HIGH);
  pwm->write(value);
}

void FullHBridge::stop() {
  HBridge::signal();

  in1->write(LOW);
  in2->write(LOW);
  pwm->write(0);
}

HalfHBridge::HalfHBridge(OutPin* in1, OutPin* in2) {
  this->in1 = in1;
  this->in2 = in2;
}

void HalfHBridge::begin() {
  in1->begin();
  in2->begin();
}

void HalfHBridge::forward(int32_t value) {
  HBridge::signal();

  in1->write(value);
  in2->write(LOW);
}

void HalfHBridge::backward(int32_t value) {
  HBridge::signal();

  in1->write(LOW);
  in2->write(value);
}

void HalfHBridge::stop() {
  HBridge::signal();

  in1->write(LOW);
  in2->write(LOW);
}
