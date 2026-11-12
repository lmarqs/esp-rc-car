# esp-rc-car

Firmware for a 1:10 RC car run by an ESP32, built with arduino-cli on the
[Bluepad32](https://github.com/ricardoquesada/bluepad32) ESP32 core. The repository holds a library of drivers in
`lib/` and the sketches that use it in `sketches/`. The car's own sketch is not written yet;
[docs/sketches](docs/sketches/README.md) says what each sketch does, and `sketches/blink/simple` proves the toolchain
works.
Two sketches run on other boards, each on the core its `sketch.yaml` pins: `sketches/web-relay` on an ESP-01S and
`sketches/usb-key` on a Digispark ATtiny85.

This README is for someone who knows Arduino basics and wants to build and flash a sketch. It covers the toolchain
and the code layout; the chassis and its printed parts are in [Hardware](#hardware).

## Build a sketch

[mise](https://mise.jdx.dev) installs every tool the build needs, at the versions `mise.toml` pins: arduino-cli,
Python, uv and clang-format. From the repository root:

```sh
mise install
mise run '*:setup'
mise run arduino:compile sketches/blink/simple
```

`mise run '*:setup'` runs each `setup` task: `python:setup` installs pyserial into `.venv`, which every compile needs
because the core's esptool fails without it, and `node:setup` installs the website's packages and the browser its tests
use. The first compile of a sketch also downloads its core into `.arduino/`. `mise tasks` lists every task.

A sketch with more than one board has a profile for each in its `sketch.yaml`, and the task builds the default one.
Build another with `mise exec -- arduino-cli compile <sketch> --profile <profile>`.

`mise run arduino:compile-all` builds every sketch's default profile and stops at the first that fails.

A sketch reads its passwords and the values of one build of its robot from `<sketch>/local.h`, which Git ignores;
the sketch's page in [docs/sketches](docs/sketches/README.md) lists the names it reads.

## Test the drivers

```sh
mise run lib:test
```

The task builds each program in `test/` with the machine's `g++` and runs it. The tests cover the drivers in `lib/`
that compute without hardware; `test/host_test.h` gives them their assertions.

## Build and test the website

Robomania, the project's website, lives in `site/`. After `mise run '*:setup'`:

```sh
mise run arduino:firmware
mise run site:build
mise run site:test
```

`site:build` type-checks the site with `astro check` before it builds.

`arduino:firmware` compiles every sketch that has an ESP profile and writes the images and a `manifest.json` to
`site/public/firmware/`, which Git ignores; the site's Flash page and project pages read them. It refuses to build a
sketch that has a `local.h`, since that file's passwords would ship to every visitor; `--allow-local` overrides it.
`site:dev` serves the site with live reload, and `site:test` runs the unit and browser tests against a build.

## Edit in VS Code

`.vscode/` sets up the Microsoft C/C++ extension: IntelliSense reads `.build/compile_commands.json`, and saving a
C or C++ file formats it with `.clang-format`. `arduino:compile` writes the database: it merges the compile database
of every sketch compiled so far and points each sketch's entry at its `.ino`. Compile a sketch once before editing it.

## Flash a sketch

The website's Flash page puts a sketch on an ESP32, ESP32-C3 or ESP8266 board over USB from Chrome or Edge, with no
tools installed. With the tools, connect the board over USB and pass its serial port, such as `/dev/ttyUSB0`:

```sh
mise run arduino:run sketches/blink/simple --port /dev/ttyUSB0 --monitor
```

The task compiles and uploads; `--monitor` then opens the serial monitor at 115200 baud, the speed every sketch with
serial output uses. Your user needs read and write access to the port: on Debian and Ubuntu, membership in the
`dialout` group. A board that uploads through its own USB bootloader, such as the Digispark, takes no `--port`.
Flashing has not been tried on a board yet; report what fails.

## Code layout

Each sketch is a folder with a `sketch.yaml` that pins the board, the core version and the libraries, one or two
levels under `sketches/`: `sketches/<name>/`, or `sketches/<project>/<variant>/` for a project whose variants are
steps of one ladder. A sketch's path under `sketches/`, such as `blink/simple`, names it in the firmware manifest.
`sketches/blink/simple/sketch.yaml` is the one to copy. A sketch uses the drivers by listing the path to `lib`,
`../../lib` at one level and `../../../lib` at two, under `libraries`.

The drivers in `lib/`:

| Files | Drives |
| --- | --- |
| `pin.h`, `digital_pin.*`, `analog_pin.*` | GPIO pins through the Arduino API |
| `board_led.*` | The LED on the board the sketch is built for |
| `line_reader.*` | Serial bytes split into lines |
| `serial_io.*` | The serial port as lines: read without waiting, printed with `Print` |
| `ledc_pin.*` | A PWM pin through the ESP32 LEDC peripheral, on a channel it allocates |
| `h_bridge.*` | A motor through a full or half H-bridge |
| `servo.*` | A positional (180°) or continuous-rotation (360°) hobby servo on a PWM pin |
| `esc.*` | A brushless motor through its electronic speed controller, on a PWM pin |
| `imu.*` | An MPU6050 accelerometer and gyroscope on I2C |
| `complementary_filter.*` | One steady angle out of an accelerometer's and a gyroscope's readings |
| `pid_controller.*` | A PID controller |
| `camera*` | The camera of an AI Thinker ESP32-CAM |
| `web_server.*` | An HTTP and WebSocket server on the ESP-IDF `httpd` |

Another sketch uses the drivers through the Robomania library: download `robomania-<version>.zip` from a
[`lib-v` release](https://github.com/lmarqs/robomania/releases) and install it with
`ARDUINO_LIBRARY_ENABLE_UNSAFE_INSTALL=true arduino-cli lib install --zip-path robomania-<version>.zip`, or in the
Arduino IDE with Sketch > Include Library > Add .ZIP Library. It builds for ESP boards.

[docs/](docs/README.md) explains [how the parts fit](docs/architecture.md) and the [standards](docs/standards/README.md)
the code follows. `.clang-format` sets the layout; apply it with `mise exec -- clang-format -i <file>`.

## Hardware

- Chassis: [DKS chassis guide](https://dukedoks.com/portfolio/guia-chasis-rc/) and its printable
  [1:10 adaptable DKS basic chassis](https://www.printables.com/model/447947-chassis-110-adaptable-dks-basic)
- Motor: [A2212 motor mount](https://www.printables.com/model/845086-a2212-motor-mount-for-chassis-110-adaptable-dks-ba)

<!-- cook:begin io.github.lmarqs.cookbook:git#worktrees/worktrees -->
<!-- io.github.lmarqs.cookbook:git#worktrees --instructions=AGENTS.md --instructions=README.md -->
- Worktrees: branch `<branch>` is checked out at `.worktrees/<branch>`; `.worktrees/README.md` says how to
  create one ready to run and remove it.
<!-- cook:end io.github.lmarqs.cookbook:git#worktrees/worktrees -->
