#include "mixer.h"

static float clampTo(float value, float low, float high) { return value < low ? low : (value > high ? high : value); }

Mixer::Mixer(float base, float minOut, float maxOut) {
  this->base = base;
  this->minOut = minOut;
  this->maxOut = maxOut;
}

MotorThrottles Mixer::mix(float correction) const {
  return {clampTo(base + correction, minOut, maxOut), clampTo(base - correction, minOut, maxOut)};
}
