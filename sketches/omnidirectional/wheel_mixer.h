#pragma once

#include <stdint.h>

/** The largest stick deflection mixWheels() uses; larger values are clamped to it. */
const int32_t STICK_MAX = 512;

/** A gamepad stick's deflection as Bluepad32 reports it: x is positive to the right, y is positive downward. */
struct Stick {
  int32_t x;
  int32_t y;
};

/** Signed speeds of the four wheels, each from -STICK_MAX to STICK_MAX; the sign sets the direction. */
struct WheelSpeeds {
  int32_t values[4];
};

/**
 * Turns the rotation stick and the translation stick into wheel speeds. Deflections under the dead zone count as
 * zero; when both sticks are pushed, each stick's share of the result is in proportion to how far it is pushed.
 */
WheelSpeeds mixWheels(Stick rotation, Stick translation);
