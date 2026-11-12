#pragma once

#include <stdint.h>

#include "blink_controller.h"

/** The name a mode has in the HTTP API and the page: "blink", "on" or "off". */
const char* blinkModeName(BlinkMode mode);
bool parseBlinkMode(const char* name, BlinkMode& out);

/**
 * The setting as stored in EEPROM, byte for byte. The magic and version tell a record this firmware wrote from an
 * empty EEPROM or another firmware's data.
 */
struct BlinkSetting {
  uint8_t magic;
  uint8_t version;
  uint8_t mode;
  uint32_t periodMs;

  static constexpr uint8_t MAGIC = 0xB1;
  static constexpr uint8_t VERSION = 1;
};

BlinkSetting blinkSettingFrom(const BlinkController& controller);

/** Applies a stored record when it is valid. Returns false, with the controller untouched, when it is not. */
bool applyBlinkSetting(const BlinkSetting& setting, BlinkController& controller);
