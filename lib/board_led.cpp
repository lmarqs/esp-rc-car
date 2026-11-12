#include "board_led.h"

#include <Arduino.h>

#if defined(ESP8266)
BoardLed::BoardLed() : DigitalOutPin(2, LOW) {}
#else
BoardLed::BoardLed() : DigitalOutPin(2, HIGH) {}
#endif
