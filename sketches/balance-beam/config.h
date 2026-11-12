#pragma once

#include <Arduino.h>

#if __has_include("local.h")
#include "local.h"
#endif

#if CONFIG_IDF_TARGET_ESP32C3
// ESP32-C3 Super Mini. GPIO2 is a strapping pin that must be high at reset, which an idle I2C bus is. GPIO8 and
// GPIO9 strap the boot mode, and GPIO18 and GPIO19 carry the USB port.
const uint8_t I2C_SDA_PIN = 2;
const uint8_t I2C_SCL_PIN = 3;
const uint8_t ESC_1_PIN = 0;
const uint8_t ESC_2_PIN = 1;
#else
// ESP32 WROOM-32. None of these straps the boot mode, as GPIO0, 2, 12 and 15 do. A WROVER module wires GPIO16 and
// GPIO17 to its PSRAM.
const uint8_t I2C_SDA_PIN = 32;
const uint8_t I2C_SCL_PIN = 33;
const uint8_t ESC_1_PIN = 16;
const uint8_t ESC_2_PIN = 17;
#endif

// The compile-time defaults of the settings that `cfg set` can store on the board; a stored value wins over them.

// The sensor's reading of a level beam, in degrees, which depends on how the sensor is mounted.
#ifndef BALANCE_BEAM_ANGLE_OFFSET_DEG
#define BALANCE_BEAM_ANGLE_OFFSET_DEG 0.0f
#endif
const float DEFAULT_ANGLE_OFFSET_DEG = BALANCE_BEAM_ANGLE_OFFSET_DEG;

const float FILTER_ALPHA = 0.98f;

// The control task sleeps in FreeRTOS ticks of 1 ms, so a rate that does not divide 1000 would run at another rate.
const uint32_t LOOP_HZ = 200;
static_assert(1000UL % LOOP_HZ == 0, "LOOP_HZ must divide 1000");

// Throttle fraction per degree of error, the gains the loop starts with.
const float KP = 0.002f;
const float KI = 0.000f;
const float KD = 0.0008f;

const float SETPOINT_DEG = 0.0f;

// The throttle band, as fractions of the ESC's pulse range: a motor never goes below MIN or above MAX, and both
// rest at MID while the beam is on target. All three are 0 until local.h sets them for the motors in use, so a
// fresh build never spins a motor.
#ifndef BALANCE_BEAM_THROTTLE_MIN
#define BALANCE_BEAM_THROTTLE_MIN 0.0f
#endif
#ifndef BALANCE_BEAM_THROTTLE_MID
#define BALANCE_BEAM_THROTTLE_MID 0.0f
#endif
#ifndef BALANCE_BEAM_THROTTLE_MAX
#define BALANCE_BEAM_THROTTLE_MAX 0.0f
#endif
constexpr float DEFAULT_THROTTLE_MIN = BALANCE_BEAM_THROTTLE_MIN;
constexpr float DEFAULT_THROTTLE_MID = BALANCE_BEAM_THROTTLE_MID;
constexpr float DEFAULT_THROTTLE_MAX = BALANCE_BEAM_THROTTLE_MAX;
static_assert(DEFAULT_THROTTLE_MIN >= 0.0f, "BALANCE_BEAM_THROTTLE_MIN must be 0 or more");
static_assert(DEFAULT_THROTTLE_MAX <= 1.0f, "BALANCE_BEAM_THROTTLE_MAX must be 1 or less");
static_assert(DEFAULT_THROTTLE_MIN <= DEFAULT_THROTTLE_MID && DEFAULT_THROTTLE_MID <= DEFAULT_THROTTLE_MAX,
              "BALANCE_BEAM_THROTTLE_MID must lie between MIN and MAX");

#ifndef BALANCE_BEAM_TILT_LIMIT_DEG
#define BALANCE_BEAM_TILT_LIMIT_DEG 45.0f
#endif
const float DEFAULT_TILT_LIMIT_DEG = BALANCE_BEAM_TILT_LIMIT_DEG;

#ifndef BALANCE_BEAM_AP_SSID
#define BALANCE_BEAM_AP_SSID "balance-beam"
#endif
// Whoever joins the hotspot can arm the motors, so it has a password by default. One shorter than 8 characters,
// which WPA2 refuses, opens the hotspot.
#ifndef BALANCE_BEAM_AP_PASSWORD
#define BALANCE_BEAM_AP_PASSWORD "thebalancebot"
#endif
const char DEFAULT_AP_SSID[] = BALANCE_BEAM_AP_SSID;
const char DEFAULT_AP_PASSWORD[] = BALANCE_BEAM_AP_PASSWORD;

// The bench commands drive each ESC directly, past the throttle band and the tilt limit, so they are compiled in
// only on request and used with the propellers off.
#ifndef BALANCE_BEAM_BENCH_ENABLED
#define BALANCE_BEAM_BENCH_ENABLED 0
#endif
