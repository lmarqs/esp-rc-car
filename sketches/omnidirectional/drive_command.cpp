#include "drive_command.h"

DriveCommandSource::DriveCommandSource(uint32_t timeoutMs) { this->timeoutMs = timeoutMs; }

void DriveCommandSource::put(Origin origin, const DriveCommand& command, uint32_t nowMs) {
  std::lock_guard<std::mutex> lock(mutex);
  slots[origin] = {command, nowMs, true};
}

void DriveCommandSource::forget(Origin origin) {
  std::lock_guard<std::mutex> lock(mutex);
  slots[origin].received = false;
}

bool DriveCommandSource::latest(uint32_t nowMs, DriveCommand* command) {
  std::lock_guard<std::mutex> lock(mutex);

  for (int origin = 0; origin < ORIGIN_COUNT; origin++) {
    const Slot& slot = slots[origin];

    // A signed age stays right when millis() wraps, and counts as fresh a command another task stamped after nowMs.
    if (slot.received && (int32_t)(nowMs - slot.receivedMs) <= (int32_t)timeoutMs) {
      *command = slot.command;
      return true;
    }
  }

  return false;
}
