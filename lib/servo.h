#pragma once

#include <Arduino.h>

#include "pin.h"

/**
 * A hobby servo driven by pulse width on a PWM pin. The pin must already run at `frequency` Hz with `resolution`
 * bits of duty, such as an EspLedcOutPin at 50 Hz and 16 bits.
 */
class Servo {
 private:
  OutPin* pwm;
  uint32_t periodUs;
  uint8_t resolution;

 protected:
  uint32_t minPulseUs, maxPulseUs;

 public:
  Servo(OutPin* pwm, uint32_t frequency, uint8_t resolution, uint32_t minPulseUs, uint32_t maxPulseUs);
  void begin();
  void writeMicroseconds(uint32_t pulseUs);
};

/** A servo that holds the angle each pulse width encodes, from 0 to `range` degrees, such as 180. */
class PositionalServo : public Servo {
 private:
  uint16_t range;

 public:
  PositionalServo(OutPin* pwm, uint32_t frequency, uint8_t resolution, uint16_t range = 180, uint32_t minPulseUs = 544,
                  uint32_t maxPulseUs = 2400);
  void write(int32_t angle);
};

/**
 * A continuous-rotation (360°) servo: the pulse width sets speed and direction, and the middle pulse stops it.
 * `speed` runs from -100 (full reverse) to 100 (full forward).
 */
class ContinuousServo : public Servo {
 public:
  ContinuousServo(OutPin* pwm, uint32_t frequency, uint8_t resolution, uint32_t minPulseUs = 1000,
                  uint32_t maxPulseUs = 2000);
  void move(int32_t speed);
  void stop();
};
