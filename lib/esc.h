#pragma once

#include <Arduino.h>

#include "pin.h"

/**
 * An electronic speed controller for a brushless motor, driven by pulse width on a PWM pin, such as an
 * EspLedcOutPin at 200 Hz. The pulse is computed from the pin's full duty range, so it moves in steps finer than a
 * microsecond.
 */
class Esc {
 private:
  PwmOutPin* pwm;
  uint32_t minPulseUs, maxPulseUs;
  bool ready = false;

 public:
  Esc(PwmOutPin* pwm, uint32_t minPulseUs = 1000, uint32_t maxPulseUs = 2000);

  /**
   * Starts the pin at the minimum pulse. An ESC arms only after it has seen that pulse for a few seconds, so the
   * sketch waits before the first write(). Returns false when the pin cannot run.
   */
  bool begin();

  /** Sets the throttle, from 0 (the minimum pulse, motor stopped) to 1 (the maximum pulse). */
  void write(float throttle);

  /** The pulse width, in microseconds, that write() sends for `throttle`. */
  float pulseUs(float throttle) const;
};
