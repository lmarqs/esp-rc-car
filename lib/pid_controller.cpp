#include "pid_controller.h"

static float clampTo(float value, float low, float high) { return value < low ? low : (value > high ? high : value); }

PidController::PidController(PidGains gains, float outMin, float outMax) {
  this->gains = gains;
  this->outMin = outMin;
  this->outMax = outMax;
}

void PidController::setGains(PidGains gains) { this->gains = gains; }

PidGains PidController::getGains() const { return gains; }

void PidController::setOutputLimits(float outMin, float outMax) {
  this->outMin = outMin;
  this->outMax = outMax;
}

void PidController::reset() {
  integral = 0.0f;
  hasPrevious = false;
}

float PidController::update(float setpoint, float measurement, float dt) {
  const float error = setpoint - measurement;

  float measurementRate = 0.0f;
  if (dt > 0.0f) {
    integral += error * dt;
    if (hasPrevious) {
      measurementRate = (measurement - previousMeasurement) / dt;
    }
  }
  previousMeasurement = measurement;
  hasPrevious = true;

  if (gains.ki != 0.0f) {
    const float a = outMin / gains.ki;
    const float b = outMax / gains.ki;
    integral = clampTo(integral, a < b ? a : b, a < b ? b : a);
  }

  return clampTo(gains.kp * error + gains.ki * integral - gains.kd * measurementRate, outMin, outMax);
}

float PidController::getIntegral() const { return integral; }
