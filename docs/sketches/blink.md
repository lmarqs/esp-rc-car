---
description: Explains the four blink sketches, a ladder from a LED that toggles every second to one that takes commands: the LED on GPIO 2, the serial lines each step prints and reads, and what each adds.
audience: Whoever sets up the toolchain or tries a new board, or changes a blink step
---
# Blink

The blink sketches prove that a build, an upload and the board all work, before anything is wired to the board, and
then teach one idea per step. They need nothing but the board. Each step is a sketch in `sketches/blink/<step>`
that adds one idea to the step before it. The website shows them as a ladder on its Blink page, next to a simulated
board that runs each step's code.

All four steps:

- Drive the LED on GPIO 2.
- Use the serial port at 115200 baud, and print a blank line and `sketch blink/<step>` once at start. The website
  reads that line to tell which step a connected board runs.
- Print `HIGH` or `LOW` as the LED changes.

The steps that read serial take a line ended by a newline, so a serial monitor has to send one with each line.

## The steps

| Step | Adds | Serial lines it prints | Lines it reads |
| --- | --- | --- | --- |
| `blink/simple` | The blink: on for one second, off for one second, with `delay()`. | `HIGH`, `LOW` | none |
| `blink/input` | The interval, set from serial. | `HIGH`, `LOW`, `delay <ms>` | a number |
| `blink/timer` | Blinking without `delay()`, so a number is read on the next pass of `loop()`. | `HIGH`, `LOW`, `delay <ms>` | a number |
| `blink/commands` | Pausing and resuming, and a reply to every line. | `HIGH`, `LOW`, `delay <ms>`, `paused`, `running`, `? <line>` | `pause`, `run`, `delay <ms>` |

### simple

The LED turns on for one second, then off for one second, and repeats. The sketch prints `HIGH` or `LOW`, then
changes the LED.

### input

The interval starts at 1000 ms. A line that starts with a digit sets it, clamped to 100 ms to 2000 ms, and the sketch
prints `delay <ms>` with the value it took. A line that starts with anything else is ignored with no reply. The
sketch reads a line once per pass of `loop()`, between two `delay()` calls, so a line sent during a pass is read after
both waits, up to 4 seconds at the longest interval, and the pass under way keeps the old interval. When no newline
has arrived, the read waits up to the serial timeout, one second by default, before it gives up.

### timer

The same numbers set the interval, and `delay <ms>` is the reply, but the sketch toggles the LED when `millis()` shows
the interval has passed, so `loop()` never waits and a line is read on the next pass. A shorter interval applies at
once, since the sketch compares the time since the last toggle with the new interval. The sketch collects characters
until a newline, so a half-sent line is kept for the next pass.

### commands

Three commands, each ended by a newline:

- `pause` stops the blinking and holds the LED as it is; the sketch prints `paused`.
- `run` resumes it and prints `running`.
- `delay <ms>` sets the interval as `blink/input` does, clamped to 100 ms to 2000 ms, and prints `delay <ms>`. It
  needs a digit after `delay `.

Any other line that is not empty prints `? <line>`; an empty line prints nothing. Commands are case-sensitive.

## Not handled

- A board whose LED is on another pin shows no blink. The serial lines still show the sketch runs.
- `blink/input` and `blink/timer` read a number only when the line starts with a digit, so `12x` sets 100 ms, the
  clamped value of 12. The sketches do not reject trailing characters.
