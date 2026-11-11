#pragma once

#include <Arduino.h>

#include "this_analog_pin.h"
#include "this_digital_pin.h"

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
  OutPin *pwm, *in1, *in2;

 public:
  FullHBridge(OutPin* pwm, OutPin* in1, OutPin* in2);
  void begin();
  void stop();
  void forward(int32_t value);
  void backward(int32_t value);
};

class HalfHBridge : public HBridge {
 private:
  OutPin *pwm, *in1, *in2;

 public:
  HalfHBridge(OutPin* in1, OutPin* in2);
  void begin();
  void stop();
  void forward(int32_t value);
  void backward(int32_t value);
};
