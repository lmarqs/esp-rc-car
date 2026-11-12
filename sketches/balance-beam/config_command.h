#pragma once

#include <stddef.h>
#include <stdint.h>

/** The settings a visitor sends over the serial port, in the order `cfg get` lists them. */
enum ConfigField : uint8_t {
  CONFIG_AP_SSID,
  CONFIG_AP_PASSWORD,
  CONFIG_ANGLE_OFFSET_DEG,
  CONFIG_THROTTLE_MIN,
  CONFIG_THROTTLE_MID,
  CONFIG_THROTTLE_MAX,
  CONFIG_TILT_LIMIT_DEG,
  CONFIG_FIELD_COUNT
};

static const size_t CONFIG_SSID_MAX = 32;
static const size_t CONFIG_PASSWORD_MIN = 8;
static const size_t CONFIG_PASSWORD_MAX = 63;

/**
 * The values the board has stored, each present or absent. A value that is absent falls back to the sketch's
 * compile-time default.
 */
struct StoredConfig {
  char apSsid[CONFIG_SSID_MAX + 1];
  char apPassword[CONFIG_PASSWORD_MAX + 1];
  /** One per number field, from CONFIG_ANGLE_OFFSET_DEG on. */
  float numbers[CONFIG_FIELD_COUNT - CONFIG_ANGLE_OFFSET_DEG];
  uint8_t storedMask;
};

/** What the sketch uses for a setting the board has nothing stored for. */
struct ConfigDefaults {
  const char* apSsid;
  const char* apPassword;
  float angleOffsetDeg;
  float throttleMin;
  float throttleMid;
  float throttleMax;
  float tiltLimitDeg;
};

/** What the sketch runs with: each stored value, else its default. */
struct BoardSettings {
  char apSsid[CONFIG_SSID_MAX + 1];
  char apPassword[CONFIG_PASSWORD_MAX + 1];
  float angleOffsetDeg;
  float throttleMin;
  float throttleMid;
  float throttleMax;
  float tiltLimitDeg;
  /** True when the throttles did not satisfy 0 <= min <= mid <= max <= 1, so the band is 0 and no motor spins. */
  bool bandRejected;
};

/** What the caller does after a line: nothing, store one field, or restart the board. */
enum class ConfigAction { None, Save, Restart };

/** What handleConfigLine decided. `field` says which value to store when the action is Save. */
struct ConfigResult {
  ConfigAction action;
  ConfigField field;
};

/** The room handleConfigLine needs for its reply. */
static const size_t CONFIG_REPLY_MAX = 256;

/** A record with nothing stored. */
StoredConfig emptyConfig();

/** The protocol's name for a field, such as "throttle_min". */
const char* configKey(ConfigField field);

/** Whether a field holds text, as the two hotspot fields do, or a number. */
bool configFieldIsText(ConfigField field);

bool configIsStored(const StoredConfig& config, ConfigField field);

/** The stored value of a text or a number field; only meaningful when configIsStored. */
const char* storedText(const StoredConfig& config, ConfigField field);
float storedNumber(const StoredConfig& config, ConfigField field);

/**
 * Puts a value read back from flash into the record. A value outside its field's limits is refused and the field
 * stays absent, so a corrupt entry cannot reach the control loop. Returns whether the value was kept.
 */
bool restoreText(StoredConfig& config, ConfigField field, const char* value);
bool restoreNumber(StoredConfig& config, ConfigField field, float value);

/**
 * The values to run with. Stored throttles that, mixed with the defaults, break 0 <= min <= mid <= max <= 1 give a
 * band of 0 with bandRejected set.
 */
BoardSettings activeSettings(const StoredConfig& config, const ConfigDefaults& defaults);

/** Whether a line belongs to the protocol: it is "cfg" or starts with "cfg ". */
bool isConfigLine(const char* line);

/**
 * Runs one line of the serial protocol and writes the reply, each line ending in '\n', into reply, up to n bytes
 * (CONFIG_REPLY_MAX is enough). A line that is not a config line leaves the reply empty and the action None.
 *
 *   cfg set <key> <value>  ->  "cfg ok <key>" or "cfg err <key> <reason>"; the value is the rest of the line.
 *                              Save when the stored value changed or was absent, else None.
 *   cfg get                ->  "cfg <key>=<value>" per key, passwords as "set" or "unset", then "cfg end"
 *   cfg restart            ->  an empty reply and Restart
 *   anything else          ->  "cfg err - syntax"
 *
 * A line as long as LineReader keeps, which it may have cut short, is a syntax error too.
 *
 * The keys are ap_ssid, ap_password, angle_offset_deg, throttle_min, throttle_mid, throttle_max and
 * tilt_limit_deg. The reasons, in the order a set checks them:
 *   armed    the balancer is armed; every set is refused, since saving blocks the control task
 *   unknown  no such key
 *   length   an SSID is not 1 to 32 characters
 *   too short, too long   a password is not 8 to 63 characters
 *   number   the value is not a finite decimal number
 *   range    angle_offset_deg lies outside [-30, 30], tilt_limit_deg outside (0, 90], a throttle outside [0, 1]
 *   order    the throttle would break min <= mid <= max against the other two's current values
 *
 * A refused set leaves the stored value as it was. The values take effect at the next boot, so a client follows its
 * sets with "cfg restart". "cfg get" shows the values the next boot uses: stored, else default. When those throttles
 * break the order, which only a changed default can cause, activeSettings gives the board a band of 0 and the sketch
 * logs it at boot. Numbers print with %g, which round-trips a value typed with three decimals.
 *
 * The order check makes the sequence of sets matter when a client changes more than one throttle: it sends, each
 * time, one whose new value keeps min <= mid <= max against the other two's current values. From an ordered band
 * that differs from an ordered target such a throttle always exists: when the new mid lies above the current max, the
 * new max is at least the new mid and is accepted, and symmetrically for the min. So the band widens or narrows to the
 * target without a refusal.
 */
ConfigResult handleConfigLine(const char* line, StoredConfig& config, const ConfigDefaults& defaults, bool armed,
                              char* reply, size_t n);
