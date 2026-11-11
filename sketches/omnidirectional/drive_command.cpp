#include "drive_command.h"

DriveCommandSource::DriveCommandSource(uint32_t timeoutMs) { this->timeoutMs = timeoutMs; }

void DriveCommandSource::put(Origin origin, const DriveCommand& command, uint32_t nowMs) {
  std::lock_guard<std::mutex> lock(mutex);
  slots[origin] = {command, nowMs, true};
}

bool DriveCommandSource::latest(uint32_t nowMs, DriveCommand* command) {
  std::lock_guard<std::mutex> lock(mutex);

  for (int origin = 0; origin < ORIGIN_COUNT; origin++) {
    const Slot& slot = slots[origin];

    // Unsigned subtraction keeps the age right when millis() wraps.
    if (slot.received && nowMs - slot.receivedMs <= timeoutMs) {
      *command = slot.command;
      return true;
    }
  }

  return false;
}
