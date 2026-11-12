#pragma once

/** Whether the lamp is on, with the name the serial log prints for it. */
class BlinkOutput {
 public:
  constexpr explicit BlinkOutput(bool on) : on_(on) {}

  constexpr bool isOn() const { return on_; }
  /** "on" or "off". */
  const char* name() const;

 private:
  bool on_;
};
