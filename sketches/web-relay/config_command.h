#pragma once

#include <stddef.h>
#include <stdint.h>

/**
 * The settings sent over the serial port, as stored in EEPROM, byte for byte. An empty string means the board has no
 * value stored and falls back to the sketch's compile-time default. The magic and version tell a record this firmware
 * wrote from an empty EEPROM or another firmware's data.
 */
struct StoredConfig {
  uint8_t magic;
  uint8_t version;
  char apSsid[33];
  char apPassword[64];
  char otaPassword[64];

  static constexpr uint8_t MAGIC = 0xC5;
  static constexpr uint8_t VERSION = 1;
  static constexpr size_t SSID_MAX = 32;
  static constexpr size_t PASSWORD_MIN = 8;
  static constexpr size_t PASSWORD_MAX = 63;
};

static_assert(sizeof(StoredConfig) == 163,
              "StoredConfig is written to EEPROM as it is; changing it needs a new VERSION");

/** What the sketch uses for a setting the board has no value stored for. */
struct ConfigDefaults {
  const char* apSsid;
  const char* apPassword;
  const char* otaPassword;
};

/** What the caller does after a line: nothing, store the record, or restart the board. */
enum class ConfigAction { None, Save, Restart };

/** The room handleConfigLine needs for its reply. */
static const size_t CONFIG_REPLY_MAX = 192;

/** A record with nothing stored. */
StoredConfig emptyConfig();

/**
 * The record read from EEPROM when it is valid. A record with another magic or version, and each value that breaks
 * its limits, comes back as nothing stored.
 */
StoredConfig storedConfigFrom(const StoredConfig& raw);

/** The value the board uses: the stored one, else the default. */
const char* effectiveApSsid(const StoredConfig& config, const ConfigDefaults& defaults);
const char* effectiveApPassword(const StoredConfig& config, const ConfigDefaults& defaults);
const char* effectiveOtaPassword(const StoredConfig& config, const ConfigDefaults& defaults);

/**
 * Runs one line of the serial protocol and writes the reply, each line ending in '\n', into reply, up to n bytes
 * (CONFIG_REPLY_MAX is enough). A line whose first word is not "cfg" is not for this protocol: the reply is empty and
 * the action None.
 *
 *   cfg set <key> <value>  ->  "cfg ok <key>" or "cfg err <key> <reason>"; the value is the rest of the line.
 *                              Save when the stored value changed, else None.
 *   cfg get                ->  "cfg <key>=<value>" per key, passwords as "set" or "unset", then "cfg end"
 *   cfg restart            ->  an empty reply and Restart
 *   anything else          ->  "cfg err - syntax"
 *
 * A line as long as LineReader keeps, which it may have cut short, is a syntax error too.
 *
 * The keys are ap_ssid, ap_password and ota_password. The reasons are "unknown", "length" (ap_ssid), "too short" and
 * "too long" (passwords).
 */
ConfigAction handleConfigLine(const char* line, StoredConfig& config, const ConfigDefaults& defaults, char* reply,
                              size_t n);
