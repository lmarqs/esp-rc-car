#pragma once

#include <pid_controller.h>

/**
 * The hotspot and the page that tunes the beam: it shows the tilt and sets the target, the PID gains and whether
 * the loop is armed. The HTTP server runs in its own task, so the control loop reaches it only through the
 * functions below.
 */

/**
 * Starts the hotspot and the HTTP server. A password shorter than 8 characters, which WPA2 refuses, opens the
 * hotspot. Returns false when either fails.
 */
bool tuningServerBegin(const char* apSsid, const char* apPassword);

/** Gives the page the control loop's latest values. */
void tuningServerPublish(float angle, bool enabled, bool tripped, bool bench, PidGains gains, float setpoint);

/**
 * When the page changed the gains or the target since the last call, writes them over `gains` and `setpoint`, with
 * the target clamped to ±`tiltLimitDeg`, and returns true.
 */
bool tuningServerPoll(PidGains& gains, float& setpoint, float tiltLimitDeg);

/** The page's pending request: 1 to arm, 0 to disarm, -1 for none. Reading it clears it. */
int tuningServerPollArm();
