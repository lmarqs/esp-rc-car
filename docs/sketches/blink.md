---
description: Explains what the blink sketch does: it toggles the LED on GPIO 2 every second to prove a build, an upload and the board work.
audience: Whoever sets up the toolchain or tries a new board
---
# Blink

`sketches/blink` proves that a build, an upload and the board all work, before anything is wired to the board. It
needs nothing but the board.

- The LED on GPIO 2 turns on for one second, then off for one second, and repeats.
- The serial port, at 9600 baud, prints `HIGH` and `LOW` as the LED changes.

## Not handled

- A board whose LED is on another pin shows no blink. The serial lines still show the sketch runs.
