#pragma once

#include <stddef.h>

/**
 * Collects bytes into lines. CR and LF each end a line, so CRLF works, and an empty line is skipped. A line keeps its
 * spaces. Bytes past CAPACITY - 1 are dropped, so a line that long was cut short.
 */
class LineReader {
 public:
  /** The longest line kept, with its terminator. */
  static const size_t CAPACITY = 128;

  LineReader() { buffer_[0] = '\0'; }

  /** Takes one byte. Returns true when it ended a line, which line() holds until the next call. */
  bool feed(char c);
  const char* line() const { return buffer_; }

 private:
  char buffer_[CAPACITY];
  size_t length_ = 0;
  bool ready_ = false;
};
