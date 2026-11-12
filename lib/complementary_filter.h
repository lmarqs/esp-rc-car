#pragma once

/**
 * Estimates one angle from two imperfect signals: an absolute angle that is noisy, such as the one an accelerometer
 * reads from gravity, and a rate that is smooth and drifts when integrated, such as a gyroscope's. Each update
 * computes `alpha × (angle + rate × dt) + (1 − alpha) × absoluteAngle`.
 */
class ComplementaryFilter {
 private:
  float alpha;
  float angle = 0.0f;
  bool seeded = false;

 public:
  /** `alpha` is the weight of the rate, from 0 to 1; around 0.98 lets the absolute angle correct drift slowly. */
  explicit ComplementaryFilter(float alpha);

  /** Sets the estimate, so the next update blends from `angle`. */
  void reset(float angle);

  /**
   * Blends one sample and returns the new estimate, in the unit of `absoluteAngle`. `rate` is in that unit per
   * second and `dt` in seconds. The first update, when reset() has not run, returns `absoluteAngle`.
   */
  float update(float absoluteAngle, float rate, float dt);

  float getAngle() const;
};
