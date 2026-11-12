#include "line_reader.h"

bool LineReader::feed(char c) {
  if (ready_) {
    length_ = 0;
    ready_ = false;
  }
  if (c == '\r' || c == '\n') {
    if (length_ == 0) {
      return false;
    }
    buffer_[length_] = '\0';
    ready_ = true;
    return true;
  }
  if (length_ < CAPACITY - 1) {
    buffer_[length_++] = c;
  }
  return false;
}
