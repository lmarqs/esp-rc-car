#pragma once

#include <Arduino.h>

#include "line_reader.h"

/** Collects what the serial port receives into lines, as LineReader splits them, without waiting for a whole line. */
class SerialInput {
 private:
  LineReader reader;
  bool complete = false;

 public:
  /** Takes the characters that arrived. Returns true once a whole line is waiting. */
  bool ready();
  /** The waiting line, spaces kept. The next ready() starts a new line. */
  String take();
};

/** Prints to the serial port: print(), println() and printf() as Serial has them. */
class SerialOutput : public Print {
 public:
  /** Opens the port at 115200 baud, then prints a blank line and `sketch <name>`, which the website listens for. */
  void begin(const char* name);
  size_t write(uint8_t c) override;
  /** Waits until everything printed has left the port, such as before a restart. */
  void flush() override;
};
