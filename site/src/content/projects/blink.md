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
  next: "Watch the LED on GPIO 2: it turns on for one second, then off, and the board prints HIGH and LOW as it changes."
example: blink
topics: [tooling, sketches-and-drivers]
---

## What it does

Blink proves that a build, an upload and the board all work. It needs nothing but the board.

- The LED on GPIO 2 turns on for one second, then off for one second, and repeats.
- The serial port, at 115200 baud, prints a blank line and `sketch blink/simple` once at start, then `HIGH` and
  `LOW` as the LED changes.

## Run it on your board

The card above flashes this sketch onto your board from Chrome or Edge on a computer, with no tools installed. To build
and flash it yourself, install the tools (the [tooling page](../../learn/tooling/) says how), connect the board over USB
and run, from the repository's root:

```sh
mise run arduino:run sketches/blink/simple --port /dev/ttyUSB0 --monitor --baudrate 115200
```

Use your board's port in place of `/dev/ttyUSB0`; `mise exec -- arduino-cli board list` lists them. The task
compiles, uploads, and then shows the serial output.

Flashing has not been tried on a board yet. If a step fails, the repository wants to hear about it.

## How the code works

The whole sketch is one LED and a loop:

```cpp
DigitalOutPin led(2);

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("sketch blink/simple");
  led.begin();
}

void loop() {
  Serial.println("HIGH");
  led.write(HIGH);
  delay(1000);
  Serial.println("LOW");
  led.write(LOW);
  delay(1000);
}
```

`setup()` runs once when the board starts; `loop()` runs over and over after it. `DigitalOutPin` comes from the
project's [library](../../library/): it wraps a GPIO pin so the sketch says *what* it drives, and the driver knows
*how*. `delay(1000)` waits a thousand milliseconds, which is why the LED changes once a second.

## Not handled

A board whose LED is on another pin shows no blink. The serial lines still show the sketch runs.

## Why it's built this way

<div class="gap">

Why the first sketch goes through the project's own `DigitalOutPin` instead of Arduino's `digitalWrite()`.

</div>
