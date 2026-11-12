---
title: Blink
summary: An LED that turns on and off every second. The first sketch to run on a new board, before anything is wired to it.
art: led
level: beginner
state: draft
order: 1
sketch: sketches/blink/simple
steps:
  - id: simple
    sketch: sketches/blink/simple
    idea: Blink with delay()
  - id: input
    sketch: sketches/blink/input
    idea: Set the delay from serial
  - id: timer
    sketch: sketches/blink/timer
    idea: Blink without delay()
  - id: commands
    sketch: sketches/blink/commands
    idea: Pause and run by name
flash:
  baud: 115200
topics: [tooling, sketches-and-drivers]
---

## What it does

Blink proves that a build, an upload and the board all work. It needs nothing but the board. It climbs in four steps,
each a sketch that adds one idea to the one before it: it blinks with `delay()`, takes the delay from serial, blinks
without `delay()`, and takes commands by name.

- The LED on GPIO 2 turns on, then off, and repeats, one second each at first.
- The serial port, at 115200 baud, prints a blank line and `sketch blink/<step>` once at start, then `HIGH` and
  `LOW` as the LED changes.

## Run it on your board

The workbench above runs each step on a simulated board until you connect yours. From Chrome or Edge on a computer,
with no tools installed, its My board view connects to your board and flashes the step you picked; its Simulator view
goes back to the simulated one. Once the board prints its `sketch <key>` line, the workbench follows your board, and
what you send goes to it. To build and flash a step yourself, install the tools (the
[tooling page](../../learn/tooling/) says how), connect the board over USB and run, from the repository's root:

```sh
mise run arduino:run sketches/blink/simple --port /dev/ttyUSB0 --monitor
```

Use your board's port in place of `/dev/ttyUSB0`, and a step's folder, such as `sketches/blink/timer`, in place of
`sketches/blink/simple`; `mise exec -- arduino-cli board list` lists the ports. The task compiles, uploads, and then
shows the serial output.

Flashing has not been tried on a board yet. If a step fails, the repository wants to hear about it.

## The four steps

Pick a step's tab in the workbench to read its code; the lines new in that step are marked, and the arrow shows the
line the board is about to run.

### 1. simple: blink with `delay()`

The whole sketch is one LED and a loop. `setup()` runs once when the board starts; `loop()` runs over and over after
it. `DigitalOutPin` comes from the project's [library](../../library/): it wraps a GPIO pin so the sketch says *what*
it drives, and the driver knows *how*. `SerialOutput` comes from the same library: `output.begin("blink/simple")`
opens the serial port and prints the sketch's name, which is how the workbench tells which step your board runs, and
`output.println` prints a line. `delay(1000)` waits a thousand milliseconds, which is why the LED changes once a
second. While it waits, the board does nothing else.

### 2. input: set the delay from serial

The delay becomes a variable, `blinkDelay`. `SerialInput`, also from the library, gathers what arrives on the serial
port into lines: `input.ready()` says a whole line is waiting, and `input.take()` hands it over. A number in the line
sets the delay, kept between 100 ms and 2000 ms, and the board answers `delay <ms>`. The board looks for a line once per pass of
`loop()`, so the sketch still sits in `delay()` most of the time: a number you send is read only after both waits,
and the blink under way keeps the old pace.

### 3. timer: blink without `delay()`

The sketch stops waiting. `loop()` runs again and again, and each pass compares `millis()`, the time since the board
started, with the time of the last toggle: when `blinkDelay` has passed, it toggles the LED. A pass takes almost no
time, so the sketch reads the serial port on every pass, and a number you send applies at once.

### 4. commands: pause and run by name

Because the loop never waits, it can take more than one kind of line. Each line goes to `runCommand()`, which picks
what to do with it: `pause` holds the LED, `run` lets it blink
again, and `delay 500` sets the delay, as the number did before. The board answers every line: `paused`, `running`,
`delay <ms>`, or `? <line>` for one it does not know. The same words work in any serial monitor.

## Not handled

A board whose LED is on another pin shows no blink. The serial lines still show the sketch runs.

## Why it's built this way

<div class="gap">

Why the first sketch goes through the project's own `DigitalOutPin` instead of Arduino's `digitalWrite()`.

</div>
