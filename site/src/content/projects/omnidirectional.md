---
title: Omnidirectional robot
summary: Four wheels driven from a gamepad's two sticks. One stick turns the robot, the other moves it in any direction.
art: wheels
level: intermediate
state: draft
order: 3
sketch: sketches/omnidirectional
example: omnidirectional
topics: [dc-motor, h-bridge, pwm, dual-core]
---

The example above runs the same arithmetic as the firmware, so each bar shows the speed the robot would give that
motor. Drag a stick a little: while the knob's centre is inside the dashed circle, nothing moves.

## What it does

The robot follows a Bluetooth gamepad or, when none is connected, an I2C master. It stops when neither has sent a
command for 500 ms, so a robot whose input goes quiet does not drive on with its last command.

- Each stick axis runs from -512 to 512. A value within 62 of zero, about 12% of the travel, counts as zero: this
  dead zone keeps a stick at rest from creeping.
- Pushing both sticks blends the two, each in proportion to how far it is pushed.
- A wheel at full speed drives its motor at an 80% PWM duty cycle.
- The LED on GPIO 2 blinks once a second while no gamepad is connected, and stays lit while one is.

## The inputs

- **Gamepad.** The first gamepad to connect drives the robot; another one is ignored until it disconnects. The robot
  forgets paired gamepads at every boot, so a gamepad pairs again each time.
- **I2C master.** The robot listens at address `0x01`. A command is a write of 16 bytes: four little-endian
  `int32_t` values, the left stick's x and y, then the right stick's x and y.
- **Which it follows.** The gamepad's command, while it has one from the last 500 ms; otherwise the I2C master's.

## Run it on your board

With the tools installed (the [tooling page](../../learn/tooling/) says how), run from the repository's root:

```sh
mise run arduino:run sketches/omnidirectional --port /dev/ttyUSB0
```

## How the code works

The sketch splits the job into three pieces, each in its own file:

- **`drive_command`** keeps the latest command from each input with the time it arrived, and answers which one to
  follow. A command older than 500 ms counts as none.
- **`wheel_mixer`** turns the two sticks into four wheel speeds. Turning and moving differ only in which wheels
  pair up: for turning, motors 1 and 4 go together, as do 2 and 3; for moving, 1 and 3, and 2 and 4.
- **`car.h`** owns the four motors, each on a full [H-bridge](../../learn/h-bridge/) with a PWM pin at 5 kHz, and
  turns a speed into a duty cycle capped at 80%.

`loop()` reads the gamepad, picks the command to follow, mixes it and drives the motors. The I2C handler runs in a
different task from `loop()`, which is why `drive_command` guards its data with a mutex.

## What is not written down yet

<div class="gap">

Where each wheel sits on the robot and what kind of wheel it is. The code numbers the motors 1 to 4 only, so the
example shows four bars instead of a robot driving.

</div>

<div class="gap">

Why the robot takes commands over I2C as well as from a gamepad, and why 500 ms.

</div>

## Not handled

- A gamepad whose Bluetooth link stalls keeps counting as connected until the gamepad library reports the
  disconnect, which can take several seconds; until then the robot drives on its last stick position. Cut the
  motors' power to stop it.
- An I2C master that sends less often than every 500 ms makes the robot stop and start between commands. Send at
  least twice a second.
