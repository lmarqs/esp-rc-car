#pragma once

#include <Arduino.h>
#include <digital_pin.h>
#include <h_bridge.h>
#include <ledc_pin.h>

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

class MotorsSpeed {
 public:
  int32_t* values;
  int32_t normal;

  MotorsSpeed() {
    values = new int32_t[4];
    normal = 0;
  }
};

class CarPilot {
 private:
  FullHBridge* motors;

  size_t motors_len;

  MotorsSpeed* rotation;
  MotorsSpeed* translation;

 public:
  CarPilot() {
    motors = new FullHBridge[4]{
        motor1,
        motor2,
        motor3,
        motor4,
    };

    motors_len = 4;

    rotation = new MotorsSpeed();

    translation = new MotorsSpeed();
  }

  void begin() {
    for (size_t i = 0; i < motors_len; i++) {
      motors[i].begin();
    }
  }

  void noSignal() {
    for (size_t i = 0; i < motors_len; i++) {
      motors[i].noSignal();
    }
  }

  void calculateTranslation(int32_t axisX, int32_t axisY, int32_t normal) {
    translation->normal = normal;
    int32_t* speeds = translation->values;

    if (axisX >= 0 && axisY <= 0) {
      speeds[0] = speeds[2] = -axisY - axisX;
      speeds[1] = speeds[3] = +normal;
    }

    if (axisX >= 0 && axisY >= 0) {
      speeds[0] = speeds[2] = -normal;
      speeds[1] = speeds[3] = -axisY + axisX;
    }

    if (axisX <= 0 && axisY >= 0) {
      speeds[0] = speeds[2] = -axisY - axisX;
      speeds[1] = speeds[3] = -normal;
    }

    if (axisX <= 0 && axisY <= 0) {
      speeds[0] = speeds[2] = +normal;
      speeds[1] = speeds[3] = -axisY + axisX;
    }
  }

  void calculateRotation(int32_t axisX, int32_t axisY, int32_t normal) {
    rotation->normal = normal;
    int32_t* speeds = rotation->values;

    if (axisX >= 0 && axisY <= 0) {
      speeds[0] = speeds[3] = -axisY - axisX;
      speeds[1] = speeds[2] = +normal;
    }

    if (axisX >= 0 && axisY >= 0) {
      speeds[0] = speeds[3] = -normal;
      speeds[1] = speeds[2] = -axisY + axisX;
    }

    if (axisX <= 0 && axisY >= 0) {
      speeds[0] = speeds[3] = -axisY - axisX;
      speeds[1] = speeds[2] = -normal;
    }

    if (axisX <= 0 && axisY <= 0) {
      speeds[0] = speeds[3] = +normal;
      speeds[1] = speeds[2] = -axisY + axisX;
    }
  }

  void drive() {
    int32_t maxSpeed = 512;
    int32_t maxMotorsValue = PwmOutPin::DUTY_MAX * 4 / 5;

    for (size_t i = 0; i < motors_len; i++) {
      int32_t speed = rotation->normal + translation->normal
                          ? (rotation->values[i] * rotation->normal + translation->values[i] * translation->normal) /
                                (rotation->normal + translation->normal)
                          : 0;

      if (speed >= 0) {
        uint32_t normal = map(+speed, 0, maxSpeed, 0, maxMotorsValue);
        motors[i].forward(normal);
      } else {
        uint32_t normal = map(-speed, 0, maxSpeed, 0, maxMotorsValue);
        motors[i].backward(normal);
      }
    }
  }
};
