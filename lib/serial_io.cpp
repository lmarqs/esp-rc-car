#include "serial_io.h"

bool SerialInput::ready() {
  while (!complete && Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      line.trim();
      complete = true;
    } else {
      line += c;
    }
  }
  return complete;
}

String SerialInput::take() {
  String taken = line;
  line = "";
  complete = false;
  return taken;
}

void SerialOutput::begin(const char* name) {
  Serial.begin(115200);
  Serial.println();
  Serial.print("sketch ");
  Serial.println(name);
}

size_t SerialOutput::write(uint8_t c) { return Serial.write(c); }
