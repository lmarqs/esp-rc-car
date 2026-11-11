# esp-rc-car

Firmware for a 1:10 RC car run by an ESP32, built with arduino-cli on the
[Bluepad32](https://github.com/ricardoquesada/bluepad32) ESP32 core. The repository holds a library of drivers in
`lib/` and the sketches that use it in `sketches/`. The car's own sketch is not written yet; `sketches/blink` blinks
the LED on GPIO 2 and proves the toolchain works.

This README is for someone who knows Arduino basics and wants to build and flash a sketch. It covers the toolchain
and the code layout; the chassis and its printed parts are in [Hardware](#hardware).

## Build a sketch

[mise](https://mise.jdx.dev) installs every tool the build needs, at the versions `mise.toml` pins: arduino-cli,
Python, uv and clang-format. From the repository root:

```sh
mise install
mise run '*:setup'
mise run arduino:compile sketches/blink
```

`mise run '*:setup'` installs pyserial into `.venv`: every compile runs the core's esptool, which fails without it. The
first compile also downloads the ESP32 core into `.arduino/`. `mise tasks` lists every task.

## Edit in VS Code

`.vscode/` sets up the Microsoft C/C++ extension: IntelliSense reads `.build/compile_commands.json`, and saving a
C or C++ file formats it with `.clang-format`. Write the database, and again after adding a sketch or a library:

```sh
mise run vscode:compile-commands
```

The task merges every sketch's arduino-cli compile database and points each sketch's entry at its `.ino`.

## Flash a sketch

Connect the board over USB and pass its serial port, such as `/dev/ttyUSB0`:

```sh
mise run arduino:run sketches/blink --port /dev/ttyUSB0 --monitor
```

The task compiles and uploads; `--monitor` then opens the serial monitor at 9600 baud. It runs `sudo chmod` on the
port first, so it asks for your password. Flashing has not been tried on a board yet; report what fails.

## Code layout

Each sketch is a folder under `sketches/` with a `sketch.yaml` that pins the board, the core version and the
libraries; `sketches/blink/sketch.yaml` is the one to copy. A sketch uses the drivers by listing `../../lib` under
`libraries`.

The drivers in `lib/`:

| Files | Drives |
| --- | --- |
| `pin.h`, `digital_pin.*`, `analog_pin.*` | GPIO pins through the Arduino API |
| `ledc_pin.*` | A PWM pin through the ESP32 LEDC peripheral, on a channel it allocates |
| `h_bridge.*` | A motor through a full or half H-bridge |
| `servo.*` | A positional (180°) or continuous-rotation (360°) hobby servo on a PWM pin |
| `camera*` | The camera of an AI Thinker ESP32-CAM |
| `web_server.*` | An HTTP and WebSocket server on the ESP-IDF `httpd` |

Code that builds only on ESP32 is wrapped in `#ifdef ESP32`. `.clang-format` sets the style; apply it with
`mise exec -- clang-format -i <file>`.

## Hardware

- Chassis: [DKS chassis guide](https://dukedoks.com/portfolio/guia-chasis-rc/) and its printable
  [1:10 adaptable DKS basic chassis](https://www.printables.com/model/447947-chassis-110-adaptable-dks-basic)
- Motor: [A2212 motor mount](https://www.printables.com/model/845086-a2212-motor-mount-for-chassis-110-adaptable-dks-ba)

<!-- cook:begin io.github.lmarqs.cookbook:git#worktrees/worktrees -->
<!-- io.github.lmarqs.cookbook:git#worktrees --instructions=AGENTS.md --instructions=README.md -->
- Worktrees: branch `<branch>` is checked out at `.worktrees/<branch>`; `.worktrees/README.md` says how to
  create one ready to run and remove it.
<!-- cook:end io.github.lmarqs.cookbook:git#worktrees/worktrees -->
