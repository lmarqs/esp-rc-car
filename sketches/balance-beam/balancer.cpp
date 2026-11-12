#include "balancer.h"

#include <math.h>

Balancer::Balancer(ComplementaryFilter filter, PidController pid, Mixer mixer, float tiltLimitDeg)
    : filter(filter), pid(pid), mixer(mixer) {
  this->tiltLimitDeg = tiltLimitDeg;
}

void Balancer::setGains(PidGains gains) { pid.setGains(gains); }

BalancerOutputs Balancer::step(const BalancerInputs& in) {
  const float angle = filter.update(in.accelAngle, in.rate, in.dt);
  const bool tripped = fabsf(angle) > tiltLimitDeg;
  const bool active = in.enabled && !tripped;

  float correction = 0.0f;
  MotorThrottles throttles = {0.0f, 0.0f};
  if (active) {
    if (!wasActive) {
      pid.reset();
    }
    correction = pid.update(in.setpoint, angle, in.dt);
    throttles = mixer.mix(correction);
  }
  wasActive = active;

  return {angle, correction, throttles.m1, throttles.m2, active, tripped};
}
