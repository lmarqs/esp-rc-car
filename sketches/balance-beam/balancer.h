#pragma once

#include <complementary_filter.h>
#include <pid_controller.h>

#include "./mixer.h"

struct BalancerInputs {
  /** The tilt read from gravity, in degrees. */
  float accelAngle;
  /** The angular rate around the pivot, in degrees per second. */
  float rate;
  /** The target tilt, in degrees. */
  float setpoint;
  /** The time since the previous step, in seconds. */
  float dt;
  /** Whether the operator has armed the loop. */
  bool enabled;
};

struct BalancerOutputs {
  /** The estimated tilt, in degrees. */
  float angle;
  /** The PID's correction, a throttle difference. */
  float correction;
  /** Each motor's throttle, from 0 to 1. */
  float m1, m2;
  /** Whether the motors are driven this step. */
  bool active;
  /** Whether the tilt is past the limit this step. */
  bool tripped;
};

/**
 * Decides, each step, what the two motors do. Past the tilt limit, or while not enabled, the motors idle. The step
 * that drives them after an idle one starts from a cleared integral, so error gathered before cannot kick the beam.
 */
class Balancer {
 private:
  ComplementaryFilter filter;
  PidController pid;
  Mixer mixer;
  float tiltLimitDeg;
  bool wasActive = false;

 public:
  Balancer(ComplementaryFilter filter, PidController pid, Mixer mixer, float tiltLimitDeg);
  void setGains(PidGains gains);
  BalancerOutputs step(const BalancerInputs& in);
};
