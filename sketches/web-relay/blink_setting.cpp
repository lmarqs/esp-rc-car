#include "blink_setting.h"

#include <string.h>

const char* blinkModeName(BlinkMode mode) {
  switch (mode) {
    case BlinkMode::ON:
      return "on";
    case BlinkMode::OFF:
      return "off";
    default:
      return "blink";
  }
}

bool parseBlinkMode(const char* name, BlinkMode& out) {
  if (strcmp(name, "on") == 0) {
    out = BlinkMode::ON;
  } else if (strcmp(name, "off") == 0) {
    out = BlinkMode::OFF;
  } else if (strcmp(name, "blink") == 0) {
    out = BlinkMode::BLINK;
  } else {
    return false;
  }
  return true;
}

BlinkSetting blinkSettingFrom(const BlinkController& controller) {
  return BlinkSetting{BlinkSetting::MAGIC, BlinkSetting::VERSION, static_cast<uint8_t>(controller.mode()),
                      controller.period()};
}

bool applyBlinkSetting(const BlinkSetting& setting, BlinkController& controller) {
  const bool valid = setting.magic == BlinkSetting::MAGIC && setting.version == BlinkSetting::VERSION &&
                     setting.mode <= static_cast<uint8_t>(BlinkMode::BLINK);
  if (!valid) {
    return false;
  }
  controller.restore(static_cast<BlinkMode>(setting.mode), setting.periodMs);
  return true;
}
