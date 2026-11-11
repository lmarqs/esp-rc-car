#pragma once

#include <Arduino.h>
#include <digital_pin.h>
#include <h_bridge.h>
#include <ledc_pin.h>

#include "wheel_mixer.h"

EspLedcOutPin pwm1(15, 5000, 12);
DigitalOutPin in11(04);
DigitalOutPin in21(16);
FullHBridge motor1(&pwm1, &in11, &in21);

EspLedcOutPin pwm2(18, 5000, 12);
DigitalOutPin in12(05);
DigitalOutPin in22(17);
FullHBridge motor2(&pwm2, &in12, &in22);

EspLedcOutPin pwm3(25, 5000, 12);
DigitalOutPin in13(27);
DigitalOutPin in23(26);
FullHBridge motor3(&pwm3, &in13, &in23);

EspLedcOutPin pwm4(13, 5000, 12);
DigitalOutPin in14(14);
DigitalOutPin in24(12);
FullHBridge motor4(&pwm4, &in14, &in24);

class CarPilot {
 private:
  FullHBridge* motors[4] = {&motor1, &motor2, &motor3, &motor4};

 public:
  void begin() {
    for (FullHBridge* motor : motors) {
      motor->begin();
    }
  }

  void stop() {
    for (FullHBridge* motor : motors) {
      motor->stop();
    }
  }

  void drive(const WheelSpeeds& speeds) {
    int32_t maxMotorsValue = PwmOutPin::DUTY_MAX * 4 / 5;

    for (size_t i = 0; i < 4; i++) {
      int32_t speed = speeds.values[i];

      if (speed >= 0) {
        uint32_t normal = map(+speed, 0, STICK_MAX, 0, maxMotorsValue);
        motors[i]->forward(normal);
      } else {
        uint32_t normal = map(-speed, 0, STICK_MAX, 0, maxMotorsValue);
        motors[i]->backward(normal);
      }
    }
  }
};
