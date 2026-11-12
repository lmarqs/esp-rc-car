#pragma once

struct MotorThrottles {
  float m1;
  float m2;
};

/**
 * Turns one correction into the two propellers' throttles: motor 1 runs at `base` plus the correction and motor 2
 * at `base` minus it, each clamped to [minOut, maxOut]. The difference in thrust is what turns the beam.
 */
class Mixer {
 private:
  float base, minOut, maxOut;

 public:
  Mixer(float base, float minOut = 0.0f, float maxOut = 1.0f);
  MotorThrottles mix(float correction) const;
};
