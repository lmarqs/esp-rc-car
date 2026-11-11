#pragma once

#include <Arduino.h>

#include "pin.h"

/** A motor driver; `value` is a duty from 0 to PwmOutPin::DUTY_MAX, and its sign in move() sets the direction. */
class HBridge {
 private:
  uint8_t noSignalCount;

 protected:
  void signal();

 public:
  void noSignal(uint8_t whenToStop = 10);
  void move(int32_t value);
  virtual void stop();
  virtual void forward(int32_t value);
  virtual void backward(int32_t value);
};

class FullHBridge : public HBridge {
 private:
  PwmOutPin* pwm;
  OutPin *in1, *in2;

 public:
  FullHBridge(PwmOutPin* pwm, OutPin* in1, OutPin* in2);
  bool begin();
  void stop();
  void forward(int32_t value);
  void backward(int32_t value);
};

class HalfHBridge : public HBridge {
 private:
  PwmOutPin *in1, *in2;

 public:
  HalfHBridge(PwmOutPin* in1, PwmOutPin* in2);
  bool begin();
  void stop();
  void forward(int32_t value);
  void backward(int32_t value);
};
