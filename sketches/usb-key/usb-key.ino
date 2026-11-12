#include <DigiKeyboard.h>

#if __has_include("local.h")
#include "local.h"
#endif

#ifndef USB_KEY_PASSWORD
#define USB_KEY_PASSWORD "default_password"
#endif

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  // Some hosts drop the first keystroke after the keyboard enumerates, so an empty one goes first.
  DigiKeyboard.sendKeyStroke(0);
  DigiKeyboard.delay(1000);
  DigiKeyboard.println(USB_KEY_PASSWORD);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  delay(1000);
}
