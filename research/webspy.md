# Webspy: the omnidirectional robot's ESP32-CAM master

Webspy is the sketch on the ESP32-CAM that sits on the omnidirectional robot as its I2C master. It lives in
`lmarqs/robomania-old` under `webspy/`. This page records what it does, how it commands the robot, what of it this
repository already has, and what bringing it in as a sketch takes.

## Sources

| Short name | What | Version read |
| --- | --- | --- |
| old | `https://github.com/lmarqs/robomania-old`, branch `main` | commit `5c0d466f5c7b6b5bae675f7c7ffcab014143c581` |
| here | This repository | commit `fd53309` |
| core 2.0.14 | `espressif/arduino-esp32`, tag `2.0.14`, the core webspy pins | raw files at that tag |
| bp32 | `ricardoquesada/esp32-arduino-lib-builder`, `bluepad32_files/` on `master` | fetched 2026-11-14 |

Everything below was read from source. Nothing was compiled or run on a board; statements about behavior at run time
are inferences from the code and are marked as such.

## 1. What webspy does

Webspy turns the ESP32-CAM into a WiFi hotspot that serves a remote-control page: a live camera picture, an on-screen
joystick, and sliders for a camera tilt servo and the board's flash LED. It forwards the joystick or a gamepad
plugged into the browser's device to the robot over I2C.

### Files (old `webspy/`)

| File | Lines | Content |
| --- | --- | --- |
| `webspy.ino` | 181 | The whole sketch |
| `sketch.yaml` | 11 | Profile `esp32cam` |
| `data/index.html` | 25 | The page: `#stream`, `#tilt`, `#spotlight`, `#joystick` |
| `data/index.js` | 585 | Page logic (lines 1-237) and a vendored copy of Bobboteck's `joy.js` joystick (lines 239-585) |
| `data/index.css` | 114 | Layout |
| `data/index.{html,js,css}.h` | generated | `xxd --include` output, committed in old |
| `.skip.esp32c3` | 0 | Empty; nothing in old refers to it (purpose not found) |

### Dependencies

- Board and core: `esp32:esp32:esp32cam` on `esp32:esp32 (2.0.14)` (old `webspy/sketch.yaml:5-7`).
- Libraries: `WiFiManager (2.0.17)` and old `library/` (old `webspy/sketch.yaml:10-11`).
- From old `library/`: `this_esp_camera.*`, `this_esp_camera_setup.*`, `this_esp_camera_pins.h`,
  `this_esp_ledc_pin.*`, `this_esp_web_server.*` (old `webspy/webspy.ino:11-13`).
- Includes that the sketch does not need: `<WebServer.h>`, `<http_parser.h>`, and `<WiFiManager.h>`, whose only use
  is `wifiManager.resetSettings()` at boot (old `webspy/webspy.ino:6,8,10,129-131`).

### Behavior

- **WiFi.** With `WEBSPY_CREATE_AP` defined (it is, line 1) the board opens a hotspot with SSID and password both
  `rocketspy`, hard-coded in the sketch (old `webspy/webspy.ino:1-3,133-142`). Without the define it joins a network
  of that name as a station (lines 143-162).
- **Server on port 80** (old `webspy/webspy.ino:165-172`):

  | Route | Method | Does |
  | --- | --- | --- |
  | `/`, `/index.css`, `/index.js` | GET | Serve the page from the embedded headers (lines 77-87) |
  | `/input` | GET, WebSocket | Forwards each frame's payload to I2C (lines 25-37) |
  | `/tilt` | POST | Body is one `uint16_t` 0-1023, mapped to LEDC duty 116-58 on GPIO 12 at 50 Hz, 10 bit (lines 23, 57-75) |
  | `/spotlight` | POST | Body is one `uint16_t`, written as LEDC duty on GPIO 4 at 5 kHz, 10 bit (lines 22, 39-55) |

- **Server on port 81**: `/stream.jpeg` sends an endless `multipart/x-mixed-replace` MJPEG stream, one JPEG per
  camera frame, and never returns while the client is connected (old `webspy/webspy.ino:89-114,174-176`). It has its
  own server because the handler holds that server's task. The camera is QVGA JPEG, quality 10 (old
  `library/this_esp_camera_setup.cpp:30-36`).
- **Page** (old `webspy/data/index.js`): shows the stream in an `<img>` (lines 119-122), and every 100 ms (line 9)
  sends the input over the WebSocket. With a gamepad on the browser's device it sends the gamepad's four stick axes,
  and the D-pad moves the tilt and spotlight sliders by 15 per tick (lines 147-186); without one it sends the
  on-screen joystick (lines 153-155, 212-214).
- **Serial** at 9600 baud (old `webspy/webspy.ino:117`). `loop()` only sleeps (line 181).

### Defects found by reading

- The stream writes the 20-byte boundary `"\r\n--espcameraframe\r\n"` with length 36, so each frame boundary carries
  16 bytes read past the string literal (old `webspy/webspy.ino:97`).
- Spotlight uses LEDC channel 2 and tilt channel 3 (old `webspy/webspy.ino:22-23`). Core 2.0.14 drives channels 2 and
  3 from one timer, `(chan/2)%4` (core 2.0.14 `cores/esp32/esp32-hal-ledc.c:64`), and `Tilt.begin()` runs last (old
  `webspy/webspy.ino:125-127`). Inference: the spotlight's 5 kHz is replaced by the tilt's 50 Hz.
- With L1 or R1 pressed the page sends two values, 8 bytes (old `webspy/data/index.js:193-199`). The robot drops any
  write that is not 16 bytes, so those buttons command nothing.
- Every WebSocket frame goes to I2C unchecked, whatever its length (old `webspy/webspy.ino:25-29`); the result of
  `Wire.endTransmission()` is ignored.

## 2. How it commands the robot over I2C

| Aspect | Webspy (master) | Robot here (slave) | Match |
| --- | --- | --- | --- |
| Address | `Wire.beginTransmission(0x01)` (old `webspy/webspy.ino:26`) | `Wire.begin(0x01)` (`sketches/omnidirectional/omnidirectional.ino:45`) | Yes |
| Pins | SDA GPIO 14, SCL GPIO 15: `Wire.begin(14, 15)` (old `webspy/webspy.ino:121`) | Not set in the sketch; see below | n/a |
| Clock | Not set; core 2.0.14 defaults a master to 100 kHz (`cores/esp32/esp32-hal-i2c.c:70-71`) | Slave follows the master | Yes |
| Payload | The WebSocket frame as is: `new Uint32Array(values)`, four values in the normal case, 16 bytes (old `webspy/data/index.js:46-52,209,213`) | Exactly 16 bytes, read as `int32_t axis[4]`; other lengths dropped (`omnidirectional.ino:23-27`) | Yes |
| Byte order | The browser's native order, little-endian on every common device; a negative number wraps to its two's-complement `uint32` | Native little-endian `int32_t` | Yes |
| Field order | left x, left y, right x, right y (old `webspy/data/index.js:189,209`) | `{axis[0], axis[1]}` rotation, `{axis[2], axis[3]}` translation (`omnidirectional.ino:39`) | Yes |
| Range and sign | `Math.floor(axis * 512)`, so -512 to 512; y positive downward, the joystick's y negated to match (old `webspy/data/index.js:189,213`) | -512 to 512, y positive downward (`sketches/omnidirectional/wheel_mixer.h:6-8`) | Yes |
| Rate | One write per 100 ms, 10 Hz, while the WebSocket is open (old `webspy/data/index.js:9,146-156`) | Stops after 500 ms without a command (`omnidirectional.ino:13`) | Yes |

Verdict: the wire format matches `sketches/omnidirectional` and `docs/sketches/omnidirectional.md:25-27`. Details:

- `drive_command.*` holds no wire format. `DriveCommandSource` only stores the latest command per origin and applies
  the 500 ms timeout (`sketches/omnidirectional/drive_command.h:14-18`); the 16 bytes are decoded in
  `receiveEventHandler` (`omnidirectional.ino:22-40`).
- The on-screen joystick fills only the first two values and sends zeros for the other two (old
  `webspy/data/index.js:213`). Here the first pair is rotation, so without a gamepad the page can turn the robot but
  not translate it. Old `omnidirectional/omnidirectional.ino:41,53-55` maps the pairs the same way.
- Here a fresh gamepad command wins over I2C (`drive_command.cpp:18-26`); old ignored I2C whenever a gamepad was
  connected (old `omnidirectional/omnidirectional.ino:17-19`). Webspy needs no change for this.
- The robot's I2C pins: the sketch passes only the address, and core 2.0.14 then uses the variant's default pins,
  SDA 21 and SCL 22 (`libraries/Wire/src/Wire.h:98-101`, `libraries/Wire/src/Wire.cpp:74,95`,
  `variants/esp32/pins_arduino.h:17-18`). Not verified for the core the robot builds with,
  `esp32-bluepad32:esp32 (4.1.0)`, which is not installed in this checkout. `docs/sketches/omnidirectional.md` names
  no I2C pins.
- A browser on a big-endian device would send the bytes reversed. Not a practical case.

## 3. What this repository already has

| Old file | Here | Difference |
| --- | --- | --- |
| `library/this_esp_web_server.{h,cpp}` | `lib/web_server.{h,cpp}` | None beyond the include name and pointer spacing (`diff -w`) |
| `library/this_esp_camera_pins.h` | `lib/camera_pins.h` | Same pin tables, reformatted, wrapped in `#ifdef ESP32` |
| `library/this_esp_camera.*` and `this_esp_camera_setup.*` | `lib/camera.{h,cpp}` | Merged into one class. `begin()` returns `bool`, is idempotent, and takes the camera clock's LEDC timer from `ledcReserveTimer()` in place of the fixed channel 0 and timer 0 (`lib/camera.cpp:11-26`; old `library/this_esp_camera_setup.cpp:11-12`). Same sensor settings |
| `library/this_esp_ledc_pin.*` | `lib/ledc_pin.{h,cpp}` | Constructor takes `(pin, frequency, resolution)` with no channel; `begin()` allocates one and keeps pins of different frequencies on different timers (`lib/ledc_pin.h:8-26`). `write()` takes a duty out of 65535, not a raw duty (`lib/ledc_pin.cpp:112-118`, `lib/pin.h:21`) |
| Tilt servo as a raw LEDC duty | `lib/servo.h` `PositionalServo` | A servo driver by pulse width or angle (`lib/servo.h:21-29`) |
| `xxd` hexdump task | `.mise/tasks/arduino/hexdump` | Same output names, `data_index_html` and `data_index_html_len`; the headers are gitignored here (`.gitignore:7-8`) |
| The robot, `omnidirectional/` | `sketches/omnidirectional/` | Present, with the I2C contract documented in `docs/sketches/omnidirectional.md:25-29,39-40` |

Not here: the webspy sketch, its page (`index.html`, `index.js`, `index.css`, the vendored `joy.js`), and a
`docs/sketches` page for it. No sketch here uses `lib/camera.h` or `lib/web_server.h`: `web-relay` uses the core's
`WebServer` (`sketches/web-relay/web-relay.ino:13-15`). The website's camera and web-server topics are placeholders
in state `coming` (`site/src/content/topics/camera.md:7`, `site/src/content/topics/web-server.md:7`).

## 4. What bringing it in takes

Required for the sketch to build under this repository's rules:

1. **Folder.** `sketches/<name>/` with `<name>.ino`, `sketch.yaml` and `data/index.{html,js,css}`, without the
   generated `.h` files. The name is a decision left open: the folders here are hyphenated (`web-relay`,
   `balance-beam`), which suggests `web-spy`.
2. **`sketch.yaml`.** `libraries: - dir: ../../lib`. The core is a decision left open:
   - `esp32-bluepad32:esp32:esp32cam` on `esp32-bluepad32:esp32 (4.1.0)` keeps the stack to the cores `AGENTS.md`
     names, and `arduino:firmware` publishes only platforms starting with `esp32-bluepad32:esp32` or
     `esp8266:esp8266` (`.mise/tasks/arduino/firmware:29`). bp32 `boards.txt:11877` defines `esp32cam`
     (`AI Thinker ESP32-CAM`, `huge_app` partitions, PSRAM flags at lines 11903-11904) on `master`; that 4.1.0 ships
     it, and that webspy compiles on it, are not verified.
   - `esp32:esp32 (2.0.14)`, as old pins, adds a fourth core, and the website's Flash page would not offer the
     sketch.
3. **Includes.** `this_esp_camera.h` to `camera.h`, `this_esp_ledc_pin.h` to `ledc_pin.h`, `this_esp_web_server.h`
   to `web_server.h`. Drop `<WebServer.h>`, `<http_parser.h>`, `<WiFiManager.h>` and the `WiFiManager` library.
4. **LEDC pins.** `EspLedcOutPin(4, 5000, 10)` and `(12, 50, 10)`, and rescale the duties to 0-65535, or drive the
   tilt through `PositionalServo`. Call `Camera.begin()` before the pins' `begin()`, as old does, and check the
   `bool` each returns.
5. **Serial.** `Serial.begin(115200)`: `docs/standards/cpp-sources.md:20-23` requires it.
6. **Hotspot credentials.** Move the hard-coded SSID and password to defaults that a gitignored `local.h` overrides,
   as `sketches/web-relay/web-relay.ino:24-34` does (`docs/architecture.md:56-58`). `arduino:firmware` refuses a
   sketch that has a `local.h` unless run with `--allow-local`.
7. **Defects in section 1.** The boundary length on line 97 is a memory over-read and should be fixed in the port;
   the L1/R1 payload and the unchecked frame length are behavior to decide.
8. **Docs.** `docs/sketches/<name>.md` and its line in `docs/sketches/README.md` (the kind is described in
   `docs/README.md:16-20`), written with the `docs-layout` skill; the I2C pins on both boards belong on those pages.
9. **Checks.** The Done check in `AGENTS.md`; `arduino:compile-all` picks the sketch up from its `sketch.yaml`
   (`.mise/tasks/arduino/compile-all:7`). Sketches have no tests, so the behavior needs a run on the board.

Optional, each a separate decision: a `settings.json` so the website asks for the hotspot name and password; a
project page in `site/src/content/projects/`; filling the camera and web-server topics; letting the on-screen
joystick translate the robot.

## Not verified

- Anything at run time: no build and no board.
- The arduino-esp32 version inside `esp32-bluepad32:esp32 (4.1.0)`, and so whether the Wire defaults and the LEDC
  channel-to-timer mapping cited from core 2.0.14 hold on it. `lib/ledc_pin.cpp:14-17` assumes the same mapping.
- Whether `esp32cam` is in the 4.1.0 release's `boards.txt`; only `master` was read.
- Whether `WiFiManager 2.0.17` is needed for anything on the board beyond clearing stored credentials.
- The physical wiring between the two boards, and any level or pull-up parts on the I2C lines: no schematic is in
  either repository.
- Electrical side effects of webspy's pin choices on the ESP32-CAM (GPIO 4 is the flash LED per
  `lib/camera_pins.h:180-181`; GPIO 12, 14 and 15 were not checked against the board's schematic).
