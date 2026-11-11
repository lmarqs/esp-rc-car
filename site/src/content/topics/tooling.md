---
title: The toolbox
summary: The tools that turn the code into firmware on your board, and how to install them with one command.
family: Programming
art: code
level: intermediate
state: draft
order: 1
---

The project builds with [arduino-cli](https://arduino.github.io/arduino-cli/), the Arduino IDE's engine without the
window, so every build runs the same way from a terminal. [mise](https://mise.jdx.dev) installs it and every other
tool at the exact versions the repository pins in `mise.toml`.

## Build a sketch

From the repository's root:

```sh
mise install
mise run '*:setup'
mise run arduino:compile sketches/blink
```

`mise install` fetches the tools. `mise run '*:setup'` installs what they need, such as the Python package the
ESP32 upload tool depends on. The first compile also downloads the ESP32 core. `mise tasks` lists every task.

## Flash it

Connect the board over USB and pass its serial port:

```sh
mise run arduino:run sketches/blink --port /dev/ttyUSB0 --monitor
```

The task compiles and uploads; `--monitor` then opens the serial monitor at 9600 baud. Your user needs read and
write access to the port: on Debian and Ubuntu, membership in the `dialout` group.

## Edit in VS Code

The repository sets up VS Code's C/C++ extension: compiling a sketch writes a database that IntelliSense reads, and
saving a file formats it with the project's `.clang-format`. Compile a sketch once before editing it.

<div class="gap">

Why arduino-cli and mise instead of the Arduino IDE.

</div>
