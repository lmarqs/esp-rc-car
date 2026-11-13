---
description: Explains how the omnidirectional robot turns sticks into wheel motion, which input it follows, and when it stops.
audience: Whoever drives the omnidirectional robot, commands it over I2C, or changes its sketch
keywords: gamepad, Bluepad32, I2C, 0x01, failsafe, dead zone
---
# Omnidirectional

The robot that runs `sketches/omnidirectional` drives four wheels from two sticks: the left stick turns it, the
right stick moves it in any direction. It follows a Bluetooth gamepad or, when none is connected, an I2C master, and
it stops when neither has sent a command for 500 ms, so a robot whose input goes quiet does not drive on with its
last command.

## Sticks

- Each axis runs from -512 to 512, and a value beyond either end counts as that end. A value under 62 from zero,
  about 12% of the travel, counts as zero: this dead zone keeps a stick at rest from creeping.
- Pushing both sticks blends turning and moving, each in proportion to how far its stick is pushed: the left stick
  at half travel and the right at full give one third turning and two thirds moving.
- A wheel at full speed drives its motor at an 80% PWM duty cycle.

## Inputs

- **Gamepad.** The first gamepad to connect drives the robot; another one is ignored until it disconnects. The robot
  forgets paired gamepads at every boot, so a gamepad pairs again each time.
- **I2C master.** The robot listens at address `0x01`. A command is a write of 16 bytes: four little-endian
  `int32_t` values, the left stick's x and y, then the right stick's x and y. A write of any other length is
  dropped.
- **Which it follows.** The gamepad's command, while it has one from the last 500 ms; otherwise the I2C master's.
  When the gamepad disconnects, its command is dropped at once, and an I2C command from the last 500 ms takes over.

## LED

The LED on GPIO 2 blinks once a second while no gamepad is connected, and stays lit while one is.

## Not handled

- A gamepad whose Bluetooth link stalls keeps counting as connected until Bluepad32 reports the disconnect, which can
  take several seconds; until then the robot drives on its last stick position. Cut the motors' power to stop it.
- An I2C master that sends less often than every 500 ms makes the robot stop and start between commands. Send at
  least twice a second.
