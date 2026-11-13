---
description: Explains the four servo sketches, from a sweep of a servo on GPIO 13 to a move at a set speed: the serial lines each step prints and reads, and what each adds.
audience: Whoever wires a hobby servo to a board, changes a servo step or the servo driver
---
# Servo

The servo sketches check a positional hobby servo and its wiring, then teach one idea per step. Each step is a sketch
in `sketches/servo/<step>` that adds one idea to the step before it. The website shows them as a ladder on its Servo
page, next to a simulated servo that runs each step's code.

All four steps:

- Take the servo's signal wire on GPIO 13.
- Send pulses from 544 µs at 0° to 2400 µs at 180°.
- Open the serial port with `output.begin("servo/<step>")` from `lib/serial_io.h`, which sets 115200 baud and prints
  a blank line and `sketch servo/<step>`. The website reads that line to tell which step a connected board runs.
- Print `angle <n>` each time they write an angle to the servo.

End each line sent to a step with a newline. Every step that reads serial reads through `SerialInput`, which keeps
the part of a line that has arrived until the newline comes.

## The steps

| Step | Adds | Serial lines it prints | Lines it reads |
| --- | --- | --- | --- |
| `servo/sweep` | A sweep from 0° to 180° and back, with `delay()`. | `angle <n>` | none |
| `servo/angle` | An angle, set from serial and checked. | `angle <n>`, `error angle must be 0-180` | a number |
| `servo/commands` | Sweeping that serial commands start and stop, with no `delay()`. | `angle <n>`, `sweeping`, `stopped`, `error angle must be 0-180`, `error unknown command` | `angle <n>`, `sweep`, `stop` |
| `servo/speed` | A target the servo moves to at a speed. | `angle <n>`, `target <n>`, `speed <n>`, `sweeping`, `stopped`, `error angle must be 0-180`, `error speed must be 1-360`, `error unknown command` | `angle <n>`, `speed <n>`, `sweep`, `stop` |

### sweep

The servo turns from 0° to 180° one degree every 15 ms, about 2.7 seconds, then back to 1°, and repeats. It prints
`angle <n>` for every degree.

### angle

The servo starts at 90° and prints `angle 90`. A line of one to three digits from 0 to 180 turns the servo there and
prints `angle <n>`. Any other line that is not empty prints `error angle must be 0-180` and leaves the servo where it
is; `90x` is such a line. An empty line prints nothing.

### commands

The servo starts at 90° and prints `angle 90`. The sketch reads serial between moves, so it takes a command while it
sweeps.

- `angle <n>`, with `n` from 0 to 180, stops any sweep and turns the servo there; it prints `angle <n>`. An `n` out
  of range prints `error angle must be 0-180`.
- `sweep` prints `sweeping` and moves the servo one degree every 15 ms, printing `angle <n>`, and reverses at 0° and at
  180°. It starts upward from the current angle, or downward from 180°.
- `stop` prints `stopped` and holds the angle.

Any other line that is not empty prints `error unknown command`.

### speed

The servo starts at 90°, at 60 degrees per second, and prints `angle 90`.

- `angle <n>`, with `n` from 0 to 180, sets a target and stops any sweep; it prints `target <n>`. The servo then moves
  one degree at a time toward the target, printing `angle <n>` for each, so the angle lines are what the servo is
  estimated to have reached.
- `speed <n>`, with `n` from 1 to 360 degrees per second, sets the speed and prints `speed <n>`. Out of range, it
  prints `error speed must be 1-360`.
- `sweep` prints `sweeping`, aims at 180°, or at 0° from 180°, and reverses at each end, at the speed set.
- `stop` makes the target the current angle, so the servo halts where it is, and prints `stopped`.

An `angle` that is out of range prints `error angle must be 0-180`; any other line that is not empty prints
`error unknown command`.

## Not handled

- A servo built for a narrower pulse range reaches its stop before 0° or 180° and strains against it there. Use a
  servo that takes 544 µs to 2400 µs, or pass its `minPulseUs` and `maxPulseUs` to the step's `PositionalServo` constructor.
- A continuous-rotation servo spins back and forth at changing speed instead of sweeping, since the pulse width sets
  its speed, not its angle.
- `servo/speed` estimates the angle; it does not read the servo, and a real servo that cannot turn as fast as the
  target moves falls behind that estimate. The estimate spaces its moves by 1000000 ÷ speed µs in whole
  microseconds, within 0.1% of the speed asked.
