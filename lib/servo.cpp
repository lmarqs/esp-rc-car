#include "servo.h"

#include <Arduino.h>

Servo::Servo(OutPin* pwm, uint32_t frequency, uint8_t resolution, uint32_t minPulseUs, uint32_t maxPulseUs) {
  this->pwm = pwm;
  this->periodUs = 1000000 / frequency;
  this->resolution = resolution;
  this->minPulseUs = minPulseUs;
  this->maxPulseUs = maxPulseUs;
}

void Servo::begin() { pwm->begin(); }

void Servo::writeMicroseconds(uint32_t pulseUs) {
  pulseUs = constrain(pulseUs, minPulseUs, maxPulseUs);
  pwm->write(((uint64_t)pulseUs << resolution) / periodUs);
}

PositionalServo::PositionalServo(OutPin* pwm, uint32_t frequency, uint8_t resolution, uint16_t range,
                                 uint32_t minPulseUs, uint32_t maxPulseUs)
    : Servo(pwm, frequency, resolution, minPulseUs, maxPulseUs) {
  this->range = range;
}

void PositionalServo::write(int32_t angle) {
  angle = constrain(angle, 0, range);
  writeMicroseconds(map(angle, 0, range, minPulseUs, maxPulseUs));
}

ContinuousServo::ContinuousServo(OutPin* pwm, uint32_t frequency, uint8_t resolution, uint32_t minPulseUs,
                                 uint32_t maxPulseUs)
    : Servo(pwm, frequency, resolution, minPulseUs, maxPulseUs) {}

void ContinuousServo::move(int32_t speed) {
  speed = constrain(speed, -100, 100);
  writeMicroseconds(map(speed, -100, 100, minPulseUs, maxPulseUs));
}

void ContinuousServo::stop() { writeMicroseconds((minPulseUs + maxPulseUs) / 2); }
