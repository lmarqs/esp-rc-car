---
description: Explains what the servo sketch does: it sweeps a hobby servo on GPIO 13 back and forth to check the servo and its wiring.
audience: Whoever wires a hobby servo to a board or changes the servo driver
---
# Servo

`sketches/servo` sweeps a positional hobby servo from end to end, to check a servo and its wiring on the board.

- The servo's signal wire goes on GPIO 13.
- The servo turns from 0° to 180° one degree every 15 ms, about 2.7 seconds, then back, and repeats.
- The sketch sends pulses from 544 µs at 0° to 2400 µs at 180°.

## Not handled

- A servo built for a narrower pulse range reaches its stop before 0° or 180° and strains against it there. Use a
  servo that takes 544 µs to 2400 µs, or change the range in `sketches/servo/servo.ino`.
- A continuous-rotation servo spins back and forth at changing speed instead of sweeping, since the pulse width sets
  its speed, not its angle.
