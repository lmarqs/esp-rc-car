#ifdef ESP32
#include "ledc_pin.h"

#include <Arduino.h>
#include <esp32-hal-ledc.h>
#include <soc/soc_caps.h>

namespace {

#ifdef SOC_LEDC_SUPPORT_HS_MODE
const uint8_t CHANNEL_COUNT = SOC_LEDC_CHANNEL_NUM * 2;
#else
const uint8_t CHANNEL_COUNT = SOC_LEDC_CHANNEL_NUM;
#endif

// The core drives channels 2k and 2k + 1 from one timer, so both must share a frequency and resolution.
const uint8_t PAIR_COUNT = CHANNEL_COUNT / 2;
// The core gives each speed group four timers: pair k runs on timer k % 4.
const uint8_t TIMERS_PER_GROUP = 4;
const uint8_t BOTH_CHANNELS = 0b11;

struct ChannelPair {
  uint32_t frequency;
  uint8_t resolution;
  uint8_t usedChannels;
};

ChannelPair pairs[PAIR_COUNT];

int8_t takeChannel(uint8_t pair) {
  uint8_t offset = pairs[pair].usedChannels & 1 ? 1 : 0;
  pairs[pair].usedChannels |= 1 << offset;
  return pair * 2 + offset;
}

int8_t allocateChannel(uint32_t frequency, uint8_t resolution) {
  for (uint8_t pair = 0; pair < PAIR_COUNT; pair++) {
    ChannelPair& p = pairs[pair];
    if (p.usedChannels && p.usedChannels != BOTH_CHANNELS && p.frequency == frequency && p.resolution == resolution) {
      return takeChannel(pair);
    }
  }

  for (uint8_t pair = 0; pair < PAIR_COUNT; pair++) {
    if (!pairs[pair].usedChannels) {
      pairs[pair].frequency = frequency;
      pairs[pair].resolution = resolution;
      return takeChannel(pair);
    }
  }

  return -1;
}

void releaseChannel(int8_t channel) { pairs[channel / 2].usedChannels &= ~(1 << (channel % 2)); }

}  // namespace

int8_t ledcReserveTimer() {
  for (uint8_t timer = 0; timer < TIMERS_PER_GROUP; timer++) {
    bool free = true;
    for (uint8_t pair = timer; pair < PAIR_COUNT; pair += TIMERS_PER_GROUP) {
      free = free && !pairs[pair].usedChannels;
    }

    if (free) {
      for (uint8_t pair = timer; pair < PAIR_COUNT; pair += TIMERS_PER_GROUP) {
        pairs[pair].usedChannels = BOTH_CHANNELS;
      }
      return timer;
    }
  }

  return -1;
}

EspLedcOutPin::EspLedcOutPin(uint8_t pin, uint32_t frequency, uint8_t resolution) {
  this->pin = pin;
  this->requestedFrequency = frequency;
  this->resolution = resolution;
}

bool EspLedcOutPin::begin() {
  if (channel >= 0) {
    return true;
  }

  channel = allocateChannel(requestedFrequency, resolution);

  if (channel < 0) {
    log_e("No LEDC channel left for pin %u at %u Hz with %u bits", pin, requestedFrequency, resolution);
    return false;
  }

  pinMode(pin, OUTPUT);

  actualFrequency = ledcSetup(channel, requestedFrequency, resolution);

  if (!actualFrequency) {
    log_e("LEDC channel %d cannot run at %u Hz with %u bits", channel, requestedFrequency, resolution);
    releaseChannel(channel);
    channel = -1;
    return false;
  }

  ledcAttachPin(pin, channel);
  return true;
}

void EspLedcOutPin::write(uint16_t duty) {
  if (channel < 0) {
    return;
  }

  ledcWrite(channel, ((uint64_t)duty << resolution) / DUTY_MAX);
}

uint32_t EspLedcOutPin::frequency() { return actualFrequency; }
#endif
