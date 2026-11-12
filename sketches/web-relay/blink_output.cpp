#include "blink_output.h"

const char* BlinkOutput::name() const { return on_ ? "on" : "off"; }
