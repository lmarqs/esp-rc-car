#pragma once

#include <Arduino.h>

/** Collects what the serial port receives into lines, without waiting for the rest of a line. */
class SerialInput {
 private:
  String line;
  bool complete = false;

 public:
  /** Takes the characters that arrived. Returns true once a whole line is waiting. */
  bool ready();
  /** The waiting line, trimmed. The next ready() starts a new line. */
  String take();
};

/** Prints to the serial port: print() and println() as Serial has them. */
class SerialOutput : public Print {
 public:
  /** Opens the port at 115200 baud, then prints a blank line and `sketch <name>`, which the website listens for. */
  void begin(const char* name);
  size_t write(uint8_t c) override;
};
