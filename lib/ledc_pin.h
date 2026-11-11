#pragma once

#ifdef ESP32
#include <Arduino.h>

#include "pin.h"

/**
 * A PWM pin on the ESP32 LEDC peripheral. begin() picks the channel: one whose timer is free or already runs at the
 * same frequency and resolution, counting up from channel 0. analogWrite() takes its channels from the top down
 * without telling this allocator, so the two meet only when the channels run out.
 */
class EspLedcOutPin : public PwmOutPin {
 private:
  uint8_t pin;
  int8_t channel = -1;
  uint32_t requestedFrequency;
  uint32_t actualFrequency = 0;
  uint8_t resolution;

 public:
  EspLedcOutPin(uint8_t pin, uint32_t frequency, uint8_t resolution);
  bool begin();
  void write(uint16_t duty);
  uint32_t frequency();
};

/**
 * Reserves one LEDC timer, with every channel it drives in every speed group, for a driver that sets up LEDC through
 * ESP-IDF itself, such as the camera's XCLK. Returns the timer, whose channels are 2 × timer and the one after, or -1
 * when every timer drives a channel already.
 */
int8_t ledcReserveTimer();
#endif
