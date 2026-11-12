#include "complementary_filter.h"

ComplementaryFilter::ComplementaryFilter(float alpha) { this->alpha = alpha; }

void ComplementaryFilter::reset(float angle) {
  this->angle = angle;
  seeded = true;
}

float ComplementaryFilter::update(float absoluteAngle, float rate, float dt) {
  if (!seeded) {
    reset(absoluteAngle);
    return angle;
  }

  angle = alpha * (angle + rate * dt) + (1.0f - alpha) * absoluteAngle;
  return angle;
}

float ComplementaryFilter::getAngle() const { return angle; }
