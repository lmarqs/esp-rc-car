#include "config_command.h"

#include <line_reader.h>
#include <math.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/** The limits of a field. A number lies from `low` to `high`, with `low` itself out when `lowExclusive`. */
struct FieldSpec {
  const char* key;
  bool text;
  size_t minLength;
  size_t maxLength;
  float low;
  float high;
  bool lowExclusive;
};

static const FieldSpec FIELDS[CONFIG_FIELD_COUNT] = {
    {"ap_ssid", true, 1, CONFIG_SSID_MAX, 0.0f, 0.0f, false},
    {"ap_password", true, CONFIG_PASSWORD_MIN, CONFIG_PASSWORD_MAX, 0.0f, 0.0f, false},
    {"angle_offset_deg", false, 0, 0, -30.0f, 30.0f, false},
    {"throttle_min", false, 0, 0, 0.0f, 1.0f, false},
    {"throttle_mid", false, 0, 0, 0.0f, 1.0f, false},
    {"throttle_max", false, 0, 0, 0.0f, 1.0f, false},
    {"tilt_limit_deg", false, 0, 0, 0.0f, 90.0f, true},
};

static uint8_t bitOf(ConfigField field) { return static_cast<uint8_t>(1u << field); }

static size_t numberIndex(ConfigField field) { return field - CONFIG_ANGLE_OFFSET_DEG; }

static char* textSlot(StoredConfig& config, ConfigField field) {
  return field == CONFIG_AP_SSID ? config.apSsid : config.apPassword;
}

/** The reason a text of this length is refused, or nullptr when the field accepts it. */
static const char* textRefusal(const FieldSpec& spec, ConfigField field, size_t length) {
  if (field == CONFIG_AP_SSID) {
    return (length < spec.minLength || length > spec.maxLength) ? "length" : nullptr;
  }
  if (length < spec.minLength) {
    return "too short";
  }
  return length > spec.maxLength ? "too long" : nullptr;
}

static bool inRange(const FieldSpec& spec, float value) {
  return (spec.lowExclusive ? value > spec.low : value >= spec.low) && value <= spec.high;
}

static bool bandOrdered(float min, float mid, float max) { return min <= mid && mid <= max; }

/** Reads a decimal number that fills the whole text, without the spaces, hex, "nan" and "inf" strtof would take. */
static bool parseNumber(const char* text, float& value) {
  if (text[0] == '\0' || strspn(text, "0123456789+-.eE") != strlen(text)) {
    return false;
  }
  char* end = nullptr;
  const float parsed = strtof(text, &end);
  if (*end != '\0' || !isfinite(parsed)) {
    return false;
  }
  value = parsed == 0.0f ? 0.0f : parsed;
  return true;
}

static void copyText(char* to, size_t capacity, const char* from) { snprintf(to, capacity, "%s", from); }

static float numberOrDefault(const StoredConfig& config, ConfigField field, float fallback) {
  return configIsStored(config, field) ? config.numbers[numberIndex(field)] : fallback;
}

/** The stored value, else the default, for every field and without the throttle rule applied. */
static BoardSettings resolve(const StoredConfig& config, const ConfigDefaults& defaults) {
  BoardSettings settings{};
  copyText(settings.apSsid, sizeof(settings.apSsid),
           configIsStored(config, CONFIG_AP_SSID) ? config.apSsid : defaults.apSsid);
  copyText(settings.apPassword, sizeof(settings.apPassword),
           configIsStored(config, CONFIG_AP_PASSWORD) ? config.apPassword : defaults.apPassword);
  settings.angleOffsetDeg = numberOrDefault(config, CONFIG_ANGLE_OFFSET_DEG, defaults.angleOffsetDeg);
  settings.throttleMin = numberOrDefault(config, CONFIG_THROTTLE_MIN, defaults.throttleMin);
  settings.throttleMid = numberOrDefault(config, CONFIG_THROTTLE_MID, defaults.throttleMid);
  settings.throttleMax = numberOrDefault(config, CONFIG_THROTTLE_MAX, defaults.throttleMax);
  settings.tiltLimitDeg = numberOrDefault(config, CONFIG_TILT_LIMIT_DEG, defaults.tiltLimitDeg);
  return settings;
}

/** Writes lines into a caller's buffer and keeps it terminated, dropping what does not fit. */
class Reply {
 public:
  Reply(char* buffer, size_t size) : buffer_(buffer), size_(size) {
    if (size_ > 0) {
      buffer_[0] = '\0';
    }
  }

  void append(const char* format, ...) __attribute__((format(printf, 2, 3))) {
    if (used_ + 1 >= size_) {
      return;
    }
    va_list args;
    va_start(args, format);
    const int written = vsnprintf(buffer_ + used_, size_ - used_, format, args);
    va_end(args);
    if (written > 0) {
      used_ += static_cast<size_t>(written);
      if (used_ >= size_) {
        used_ = size_ - 1;
      }
    }
  }

 private:
  char* buffer_;
  size_t size_;
  size_t used_ = 0;
};

StoredConfig emptyConfig() { return StoredConfig{}; }

const char* configKey(ConfigField field) { return FIELDS[field].key; }

bool configFieldIsText(ConfigField field) { return FIELDS[field].text; }

bool configIsStored(const StoredConfig& config, ConfigField field) { return (config.storedMask & bitOf(field)) != 0; }

const char* storedText(const StoredConfig& config, ConfigField field) {
  return field == CONFIG_AP_SSID ? config.apSsid : config.apPassword;
}

float storedNumber(const StoredConfig& config, ConfigField field) { return config.numbers[numberIndex(field)]; }

bool restoreText(StoredConfig& config, ConfigField field, const char* value) {
  const FieldSpec& spec = FIELDS[field];
  const size_t length = strnlen(value, spec.maxLength + 1);
  if (!spec.text || textRefusal(spec, field, length) != nullptr) {
    return false;
  }
  char* slot = textSlot(config, field);
  memset(slot, 0, spec.maxLength + 1);
  memcpy(slot, value, length);
  config.storedMask |= bitOf(field);
  return true;
}

bool restoreNumber(StoredConfig& config, ConfigField field, float value) {
  const FieldSpec& spec = FIELDS[field];
  if (spec.text || !isfinite(value) || !inRange(spec, value)) {
    return false;
  }
  config.numbers[numberIndex(field)] = value;
  config.storedMask |= bitOf(field);
  return true;
}

BoardSettings activeSettings(const StoredConfig& config, const ConfigDefaults& defaults) {
  BoardSettings settings = resolve(config, defaults);
  if (!bandOrdered(settings.throttleMin, settings.throttleMid, settings.throttleMax)) {
    settings.throttleMin = settings.throttleMid = settings.throttleMax = 0.0f;
    settings.bandRejected = true;
  }
  return settings;
}

bool isConfigLine(const char* line) { return strncmp(line, "cfg", 3) == 0 && (line[3] == '\0' || line[3] == ' '); }

static ConfigResult noAction() { return {ConfigAction::None, CONFIG_AP_SSID}; }

static ConfigResult answerSyntaxError(Reply& reply) {
  reply.append("cfg err - syntax\n");
  return noAction();
}

static void appendNumber(Reply& reply, const char* key, float value) {
  reply.append("cfg %s=%g\n", key, static_cast<double>(value));
}

static ConfigResult answerGet(const StoredConfig& config, const ConfigDefaults& defaults, Reply& reply) {
  const BoardSettings settings = resolve(config, defaults);
  reply.append("cfg %s=%s\n", FIELDS[CONFIG_AP_SSID].key, settings.apSsid);
  reply.append("cfg %s=%s\n", FIELDS[CONFIG_AP_PASSWORD].key,
               configIsStored(config, CONFIG_AP_PASSWORD) ? "set" : "unset");
  appendNumber(reply, FIELDS[CONFIG_ANGLE_OFFSET_DEG].key, settings.angleOffsetDeg);
  appendNumber(reply, FIELDS[CONFIG_THROTTLE_MIN].key, settings.throttleMin);
  appendNumber(reply, FIELDS[CONFIG_THROTTLE_MID].key, settings.throttleMid);
  appendNumber(reply, FIELDS[CONFIG_THROTTLE_MAX].key, settings.throttleMax);
  appendNumber(reply, FIELDS[CONFIG_TILT_LIMIT_DEG].key, settings.tiltLimitDeg);
  reply.append("cfg end\n");
  return noAction();
}

static bool findField(const char* key, size_t keyLength, ConfigField& field) {
  for (int i = 0; i < CONFIG_FIELD_COUNT; i++) {
    const FieldSpec& spec = FIELDS[i];
    if (strlen(spec.key) == keyLength && strncmp(spec.key, key, keyLength) == 0) {
      field = static_cast<ConfigField>(i);
      return true;
    }
  }
  return false;
}

/** Whether the throttles, with `field` taking `value`, keep min <= mid <= max against the others' current values. */
static bool throttleOrderHolds(const StoredConfig& config, const ConfigDefaults& defaults, ConfigField field,
                               float value) {
  BoardSettings settings = resolve(config, defaults);
  if (field == CONFIG_THROTTLE_MIN) {
    settings.throttleMin = value;
  } else if (field == CONFIG_THROTTLE_MID) {
    settings.throttleMid = value;
  } else if (field == CONFIG_THROTTLE_MAX) {
    settings.throttleMax = value;
  }
  return bandOrdered(settings.throttleMin, settings.throttleMid, settings.throttleMax);
}

static bool isThrottle(ConfigField field) { return field >= CONFIG_THROTTLE_MIN && field <= CONFIG_THROTTLE_MAX; }

static ConfigResult answerSetText(const FieldSpec& spec, ConfigField field, const char* value, StoredConfig& config,
                                  Reply& reply) {
  const char* refusal = textRefusal(spec, field, strlen(value));
  if (refusal != nullptr) {
    reply.append("cfg err %s %s\n", spec.key, refusal);
    return noAction();
  }
  reply.append("cfg ok %s\n", spec.key);
  if (configIsStored(config, field) && strcmp(storedText(config, field), value) == 0) {
    return noAction();
  }
  restoreText(config, field, value);
  return {ConfigAction::Save, field};
}

static ConfigResult answerSetNumber(const FieldSpec& spec, ConfigField field, const char* text, StoredConfig& config,
                                    const ConfigDefaults& defaults, Reply& reply) {
  float value;
  if (!parseNumber(text, value)) {
    reply.append("cfg err %s number\n", spec.key);
    return noAction();
  }
  if (!inRange(spec, value)) {
    reply.append("cfg err %s range\n", spec.key);
    return noAction();
  }
  if (isThrottle(field) && !throttleOrderHolds(config, defaults, field, value)) {
    reply.append("cfg err %s order\n", spec.key);
    return noAction();
  }
  reply.append("cfg ok %s\n", spec.key);
  if (configIsStored(config, field) && storedNumber(config, field) == value) {
    return noAction();
  }
  restoreNumber(config, field, value);
  return {ConfigAction::Save, field};
}

/** Takes what follows "cfg set ": the key, one space, then the value, which may hold spaces or be empty. */
static ConfigResult answerSet(const char* args, StoredConfig& config, const ConfigDefaults& defaults, bool armed,
                              Reply& reply) {
  const char* separator = strchr(args, ' ');
  if (separator == nullptr || separator == args) {
    return answerSyntaxError(reply);
  }

  const size_t keyLength = static_cast<size_t>(separator - args);
  if (armed) {
    reply.append("cfg err %.*s armed\n", static_cast<int>(keyLength), args);
    return noAction();
  }

  ConfigField field;
  if (!findField(args, keyLength, field)) {
    reply.append("cfg err %.*s unknown\n", static_cast<int>(keyLength), args);
    return noAction();
  }
  const FieldSpec& spec = FIELDS[field];
  const char* value = separator + 1;
  return spec.text ? answerSetText(spec, field, value, config, reply)
                   : answerSetNumber(spec, field, value, config, defaults, reply);
}

ConfigResult handleConfigLine(const char* line, StoredConfig& config, const ConfigDefaults& defaults, bool armed,
                              char* reply, size_t n) {
  Reply out(reply, n);
  if (!isConfigLine(line)) {
    return noAction();
  }
  if (strlen(line) >= LineReader::CAPACITY - 1) {
    return answerSyntaxError(out);
  }

  const char* args = line + 3;
  if (strcmp(args, " get") == 0) {
    return answerGet(config, defaults, out);
  }
  if (strcmp(args, " restart") == 0) {
    return {ConfigAction::Restart, CONFIG_AP_SSID};
  }
  if (strncmp(args, " set ", 5) == 0) {
    return answerSet(args + 5, config, defaults, armed, out);
  }
  return answerSyntaxError(out);
}
