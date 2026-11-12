#pragma once

#include <stdint.h>

#include "blink_output.h"

/** What the lamp does: OFF and ON hold it, BLINK toggles it every period. */
enum class BlinkMode : uint8_t {
  OFF = 0,
  ON = 1,
  BLINK = 2,
};

/**
 * The lamp's state machine, with the clock passed in as an argument. Its timing survives the rollover of millis()
 * after 49.7 days.
 */
class BlinkController {
 public:
  static constexpr uint32_t PERIOD_MIN_MS = 200;
  static constexpr uint32_t PERIOD_MAX_MS = 3600000;
  static constexpr uint32_t PERIOD_DEFAULT_MS = 5000;
  static constexpr BlinkMode MODE_DEFAULT = BlinkMode::BLINK;

  void setMode(BlinkMode mode);
  /** Clamps the period to [PERIOD_MIN_MS, PERIOD_MAX_MS]. */
  void setPeriod(uint32_t periodMs);

  /** Applies a stored mode and period together, such as the ones read from EEPROM at boot. */
  void restore(BlinkMode mode, uint32_t periodMs);

  BlinkMode mode() const { return mode_; }
  uint32_t period() const { return periodMs_; }
  BlinkOutput output() const { return BlinkOutput{output_}; }

  /**
   * Advances the state machine and returns true when output() changed. In BLINK mode the first call starts the
   * period and leaves the lamp as it is.
   */
  bool update(uint32_t nowMs);

 private:
  static uint32_t clampPeriod(uint32_t periodMs);

  BlinkMode mode_ = MODE_DEFAULT;
  uint32_t periodMs_ = PERIOD_DEFAULT_MS;
  bool output_ = false;
  bool started_ = false;
  uint32_t lastToggleMs_ = 0;
};
