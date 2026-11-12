#include "serial_io.h"

bool SerialInput::ready() {
  while (!complete && Serial.available()) {
    complete = reader.feed(static_cast<char>(Serial.read()));
  }
  return complete;
}

String SerialInput::take() {
  complete = false;
  return String(reader.line());
}

void SerialOutput::begin(const char* name) {
  Serial.begin(115200);
  Serial.println();
  Serial.print("sketch ");
  Serial.println(name);
}

size_t SerialOutput::write(uint8_t c) { return Serial.write(c); }

void SerialOutput::flush() { Serial.flush(); }
