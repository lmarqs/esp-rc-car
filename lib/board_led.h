#pragma once

#include "digital_pin.h"

/**
 * The LED on the board the sketch is built for, on GPIO2: lit when the pin is HIGH on an ESP32 dev board and when it is
 * LOW on an ESP8266 board such as the ESP-01S.
 */
class BoardLed : public DigitalOutPin {
 public:
  BoardLed();
};
