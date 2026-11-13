---
title: Servo
summary: A hobby servo sweeping from end to end, to check a servo and its wiring.
art: servo
level: beginner
state: draft
order: 2
sketch: sketches/servo/sweep
steps:
  - id: sweep
    sketch: sketches/servo/sweep
    idea: Sweep 0–180°
  - id: angle
    sketch: sketches/servo/angle
    idea: Check the number
  - id: commands
    sketch: sketches/servo/commands
    idea: Non-blocking commands
  - id: speed
    sketch: sketches/servo/speed
    idea: Move at a limited speed
flash:
  baud: 115200
topics: [servo, pwm]
---

## What it does

The first step sweeps a positional hobby servo from end to end. The steps after it set the angle from serial, take
commands while the servo sweeps, and move it at a speed you choose.

- The servo's signal wire goes on GPIO 13.
- The first step turns the servo from 0° to 180° one degree every 15 ms, about 2.7 seconds, then back, and repeats.
- Every step sends pulses from 544 µs at 0° to 2400 µs at 180°.
- The serial port, at 115200 baud, prints a blank line and `sketch servo/<step>` once at start, then `angle <n>` as
  the angle changes.

## Run it on your board

Wire the servo's signal to GPIO 13. The workbench above runs each step on a simulated servo until you connect your
board. From Chrome or Edge on a computer, with no tools installed, the board bar at the bottom of the page connects
to your board and flashes the step you picked. The workbench's My board view shows your board, and its Simulator view
the simulated one. Once the board prints its `sketch <key>` line, the workbench follows your board under My board, and
what you send goes to it. To build and flash a step
yourself, run from the repository's root:

```sh
mise run arduino:run sketches/servo/sweep --port /dev/ttyUSB0 --monitor
```

Use a step's folder, such as `sketches/servo/speed`, in place of `sketches/servo/sweep`. The sketches compile;
uploading has not been tried from this repository yet. If a step fails, the repository wants to hear about it.

## The four steps

Pick a step's tab in the workbench to read its code; the lines new in that step are marked, and the arrow shows the
line the board is about to run.

### 1. sweep: 0° to 180° and back

A servo reads the *width* of a pulse it gets 50 times a second, every 20 ms. `EspLedcOutPin(13, 50, 16)` asks the
ESP32's LEDC hardware for a 50 Hz signal on GPIO 13 with 16 bits of resolution. `PositionalServo` turns an angle into
a pulse width: 0° becomes 544 µs and 180° becomes 2400 µs, with the angles in between spread evenly. Two `for` loops
walk the angle up and down, with `delay(15)` between degrees, and print `angle <n>` for each through `output`, the
library's `SerialOutput`.

### 2. angle: check the number

The servo starts at 90°, and a number you send turns it there. `input`, the library's `SerialInput`, hands the sketch
each line you send once it has arrived whole. The sketch accepts only whole numbers from 0 to 180,
and any other line gets `error angle must be 0-180` and moves nothing, so a typo never drives the servo past its
range.

### 3. commands: non-blocking commands

The sweep stops using `delay()`. `loop()` runs again and again, and each pass moves the servo one degree when 15 ms
have passed, if it is sweeping. Since the loop never waits, it reads a command at any moment: `angle 45` turns the
servo there and ends the sweep, `sweep` starts it and `stop` holds the angle. The board answers `sweeping` and
`stopped`, and `error unknown command` for a line it does not know.

### 4. speed: move at a limited speed

In this step, `angle 45` sets a target, and the servo moves one degree at a time toward it at a speed you choose with
`speed 1` to `speed 360`, in degrees per second. The sketch prints `target <n>` for the target and `angle <n>` for
each degree the servo is estimated to have reached; it does not read the servo. `sweep` aims at an end and turns
around at each end at that speed, and `stop` makes the target the current angle.

## Not handled

- A servo built for a narrower pulse range reaches its stop before 0° or 180° and strains against it there. Use a
  servo that takes 544 µs to 2400 µs, or pass its `minPulseUs` and `maxPulseUs` to the step's `PositionalServo` constructor.
- A continuous-rotation servo spins back and forth at changing speed instead of sweeping, since the pulse width sets
  its speed, not its angle.

## Why it's built this way

<div class="gap">

Why the servo runs on the project's own LEDC pin driver, and why 544 µs to 2400 µs.

</div>
