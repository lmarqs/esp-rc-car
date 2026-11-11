#pragma once

#include <stdint.h>

#include <mutex>

#include "wheel_mixer.h"

struct DriveCommand {
  Stick rotation;
  Stick translation;
};

/**
 * Holds the latest drive command from each origin and says which one to follow: the gamepad's while it is fresh,
 * otherwise the I2C master's. A command older than the timeout counts as none, so the robot stops when its input
 * goes quiet. Every method may be called from any task.
 */
class DriveCommandSource {
 public:
  enum Origin { GAMEPAD, I2C, ORIGIN_COUNT };

  explicit DriveCommandSource(uint32_t timeoutMs);

  void put(Origin origin, const DriveCommand& command, uint32_t nowMs);

  /** Writes the command to follow into `command`; returns false when no origin has a fresh one. */
  bool latest(uint32_t nowMs, DriveCommand* command);

 private:
  struct Slot {
    DriveCommand command;
    uint32_t receivedMs;
    bool received;
  };

  uint32_t timeoutMs;
  Slot slots[ORIGIN_COUNT] = {};
  std::mutex mutex;
};
