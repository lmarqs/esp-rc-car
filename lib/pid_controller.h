#pragma once

struct PidGains {
  float kp;
  float ki;
  float kd;
};

/**
 * A discrete PID controller. The derivative acts on the measurement, so a step in the setpoint puts no spike on the
 * output. The output is clamped to [outMin, outMax], and so is the integral's share of it, so the integral stops
 * growing while the actuator is saturated.
 */
class PidController {
 private:
  PidGains gains;
  float outMin, outMax;
  float integral = 0.0f;
  float previousMeasurement = 0.0f;
  bool hasPrevious = false;

 public:
  PidController(PidGains gains, float outMin, float outMax);

  void setGains(PidGains gains);
  PidGains getGains() const;
  void setOutputLimits(float outMin, float outMax);

  /** Clears the integral and the derivative's history, such as when the loop is enabled again. */
  void reset();

  /**
   * Advances one step of `dt` seconds and returns the clamped output. A `dt` of zero or less leaves the integral
   * as it is and gives the derivative no share of the output.
   */
  float update(float setpoint, float measurement, float dt);

  /** The accumulated error, in error units × seconds. */
  float getIntegral() const;
};
