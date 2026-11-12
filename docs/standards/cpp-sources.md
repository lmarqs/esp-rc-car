---
description: Sets how C++ files in lib/ and the sketches name headers, hide helpers, guard ESP32-only code, set the serial speed and use comments.
audience: Whoever writes or reviews a .h, .cpp or .ino file in lib/ or sketches/; knows C++ and Arduino
---
# C++ sources

Every `.h`, `.cpp` and `.ino` file in `lib/` and `sketches/` follows the rules below. `.clang-format` sets the
layout, and the Done check in [AGENTS.md](../../AGENTS.md) enforces it.

- A file MUST NOT declare a namespace or use `using namespace`, and a helper only its own file uses MUST be `static`.
  The drivers and sketches are small, so a namespace adds nesting and separates nothing. `static` keeps the helper
  out of the one image that `lib/`, the core and Bluepad32 link into, where a second function of the same name fails
  the link.
- A `lib/` header MUST NOT share its name with a header of the core or of a library a sketch uses. `lib/` is on the
  include path, so its header takes the other's place: the camera driver's files became `camera*` so that none
  would shadow `<esp_camera.h>`.
- A file in `lib/` that builds only on ESP32 MUST be wrapped in `#ifdef ESP32`, as `lib/ledc_pin.h` is. `lib/` also
  builds for other boards, and arduino-cli compiles every source of a library a sketch lists, so one unguarded
  ESP32-only file breaks the build for every other board.
- A sketch that uses the serial port MUST open it at 115200 baud: `Serial.begin(115200)`. `arduino:run` and
  `arduino:monitor` open the monitor at 115200 unless told otherwise, and the website reads every board at its
  project's `flash.baud`, so one speed for all sketches means a monitor never shows garbage after switching sketch.
- A comment SHOULD record only a reason the code cannot show, such as a hardware constraint. Nothing checks a
  comment that restates the code, so it drifts from the code. A doc comment on a header's class or method, saying
  what it promises its callers, is not such a restatement.
