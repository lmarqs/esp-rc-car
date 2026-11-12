---
title: Servo
summary: A hobby servo sweeping from end to end, to check a servo and its wiring.
art: servo
level: beginner
state: draft
order: 2
sketch: sketches/servo
flash:
  next: "Connect the servo's signal wire to GPIO 13. It sweeps from 0° to 180° and back, about 2.7 seconds each way."
example: servo
topics: [servo, pwm]
---

## What it does

The sketch sweeps a positional hobby servo from end to end.

- The servo's signal wire goes on GPIO 13.
- The servo turns from 0° to 180° one degree every 15 ms, about 2.7 seconds, then back, and repeats.
- The sketch sends pulses from 544 µs at 0° to 2400 µs at 180°.

## Run it on your board

Wire the servo's signal to GPIO 13, then from the repository's root:

```sh
mise run arduino:run sketches/servo --port /dev/ttyUSB0
```

## How the code works

```cpp
EspLedcOutPin servoPin(13, 50, 16);
PositionalServo servo(&servoPin);

void loop() {
  for (int angle = 0; angle <= 180; angle += 1) {
    servo.write(angle);
    delay(15);
  }
  // ...and the same loop back from 180 to 0.
}
```

A servo reads the *width* of a pulse it gets 50 times a second, every 20 ms. `EspLedcOutPin(13, 50, 16)` asks the
ESP32's LEDC hardware for a 50 Hz signal on GPIO 13 with 16 bits of resolution. `PositionalServo` turns an angle into
a pulse width: 0° becomes 544 µs and 180° becomes 2400 µs, with the angles in between spread evenly. Drag the angle
in the example above and watch the pulse grow.

## Not handled

- A servo built for a narrower pulse range reaches its stop before 0° or 180° and strains against it there. Use a
  servo that takes 544 µs to 2400 µs, or change the range in `sketches/servo/servo.ino`.
- A continuous-rotation servo spins back and forth at changing speed instead of sweeping, since the pulse width sets
  its speed, not its angle.

## Why it's built this way

<div class="gap">

Why the servo runs on the project's own LEDC pin driver, and why 544 µs to 2400 µs.

</div>
