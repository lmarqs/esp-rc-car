#include "config_command.h"

#include <line_reader.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>

enum FieldIndex { AP_SSID, AP_PASSWORD, OTA_PASSWORD, FIELD_COUNT };

struct FieldSpec {
  const char* name;
  size_t offset;
  size_t minLength;
  size_t maxLength;
  bool secret;
};

static const FieldSpec FIELDS[FIELD_COUNT] = {
    {"ap_ssid", offsetof(StoredConfig, apSsid), 1, StoredConfig::SSID_MAX, false},
    {"ap_password", offsetof(StoredConfig, apPassword), StoredConfig::PASSWORD_MIN, StoredConfig::PASSWORD_MAX, true},
    {"ota_password", offsetof(StoredConfig, otaPassword), StoredConfig::PASSWORD_MIN, StoredConfig::PASSWORD_MAX, true},
};

static char* valueOf(StoredConfig& config, FieldIndex field) {
  return reinterpret_cast<char*>(&config) + FIELDS[field].offset;
}

static const char* valueOf(const StoredConfig& config, FieldIndex field) {
  return reinterpret_cast<const char*>(&config) + FIELDS[field].offset;
}

static const char* defaultOf(const ConfigDefaults& defaults, FieldIndex field) {
  switch (field) {
    case AP_SSID:
      return defaults.apSsid;
    case AP_PASSWORD:
      return defaults.apPassword;
    default:
      return defaults.otaPassword;
  }
}

static const char* effective(const StoredConfig& config, const ConfigDefaults& defaults, FieldIndex field) {
  const char* stored = valueOf(config, field);
  return stored[0] != '\0' ? stored : defaultOf(defaults, field);
}

/** The reason a value of this length is refused, or nullptr when the field accepts it. */
static const char* refusalFor(const FieldSpec& spec, size_t length) {
  if (!spec.secret) {
    return (length < spec.minLength || length > spec.maxLength) ? "length" : nullptr;
  }
  if (length < spec.minLength) {
    return "too short";
  }
  return length > spec.maxLength ? "too long" : nullptr;
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

StoredConfig emptyConfig() {
  StoredConfig config{};
  config.magic = StoredConfig::MAGIC;
  config.version = StoredConfig::VERSION;
  return config;
}

StoredConfig storedConfigFrom(const StoredConfig& raw) {
  StoredConfig config = emptyConfig();
  if (raw.magic != StoredConfig::MAGIC || raw.version != StoredConfig::VERSION) {
    return config;
  }
  for (int i = 0; i < FIELD_COUNT; i++) {
    const FieldIndex field = static_cast<FieldIndex>(i);
    const FieldSpec& spec = FIELDS[field];
    const char* value = valueOf(raw, field);
    const size_t length = strnlen(value, spec.maxLength + 1);
    if (length > 0 && refusalFor(spec, length) == nullptr) {
      memcpy(valueOf(config, field), value, length);
    }
  }
  return config;
}

const char* effectiveApSsid(const StoredConfig& config, const ConfigDefaults& defaults) {
  return effective(config, defaults, AP_SSID);
}

const char* effectiveApPassword(const StoredConfig& config, const ConfigDefaults& defaults) {
  return effective(config, defaults, AP_PASSWORD);
}

const char* effectiveOtaPassword(const StoredConfig& config, const ConfigDefaults& defaults) {
  return effective(config, defaults, OTA_PASSWORD);
}

static ConfigAction answerSyntaxError(Reply& reply) {
  reply.append("cfg err - syntax\n");
  return ConfigAction::None;
}

static ConfigAction answerGet(const StoredConfig& config, const ConfigDefaults& defaults, Reply& reply) {
  for (int i = 0; i < FIELD_COUNT; i++) {
    const FieldIndex field = static_cast<FieldIndex>(i);
    if (FIELDS[field].secret) {
      reply.append("cfg %s=%s\n", FIELDS[field].name, valueOf(config, field)[0] != '\0' ? "set" : "unset");
    } else {
      reply.append("cfg %s=%s\n", FIELDS[field].name, effective(config, defaults, field));
    }
  }
  reply.append("cfg end\n");
  return ConfigAction::None;
}

/** Takes what follows "cfg set ": the key, one space, then the value, which may hold spaces or be empty. */
static ConfigAction answerSet(const char* args, StoredConfig& config, Reply& reply) {
  const char* separator = strchr(args, ' ');
  if (separator == nullptr || separator == args) {
    return answerSyntaxError(reply);
  }

  const size_t keyLength = static_cast<size_t>(separator - args);
  const char* value = separator + 1;
  for (int i = 0; i < FIELD_COUNT; i++) {
    const FieldIndex field = static_cast<FieldIndex>(i);
    const FieldSpec& spec = FIELDS[field];
    if (strlen(spec.name) != keyLength || strncmp(spec.name, args, keyLength) != 0) {
      continue;
    }

    const char* refusal = refusalFor(spec, strlen(value));
    if (refusal != nullptr) {
      reply.append("cfg err %s %s\n", spec.name, refusal);
      return ConfigAction::None;
    }
    reply.append("cfg ok %s\n", spec.name);
    char* stored = valueOf(config, field);
    if (strcmp(stored, value) == 0) {
      return ConfigAction::None;
    }
    memset(stored, 0, spec.maxLength + 1);
    memcpy(stored, value, strlen(value));
    return ConfigAction::Save;
  }

  reply.append("cfg err %.*s unknown\n", static_cast<int>(keyLength), args);
  return ConfigAction::None;
}

ConfigAction handleConfigLine(const char* line, StoredConfig& config, const ConfigDefaults& defaults, char* reply,
                              size_t n) {
  Reply out(reply, n);
  if (strncmp(line, "cfg", 3) != 0 || (line[3] != '\0' && line[3] != ' ')) {
    return ConfigAction::None;
  }
  if (strlen(line) >= LineReader::CAPACITY - 1) {
    return answerSyntaxError(out);
  }

  const char* args = line + 3;
  if (strcmp(args, " get") == 0) {
    return answerGet(config, defaults, out);
  }
  if (strcmp(args, " restart") == 0) {
    return ConfigAction::Restart;
  }
  if (strncmp(args, " set ", 5) == 0) {
    return answerSet(args + 5, config, out);
  }
  return answerSyntaxError(out);
}
