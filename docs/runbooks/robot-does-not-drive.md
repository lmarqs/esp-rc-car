---
description: Finds why the omnidirectional robot boots but its wheels do not turn, by the LED and the input it follows.
audience: Whoever drives the omnidirectional robot and sees it stand still
keywords: gamepad, Bluepad32, pairing, I2C, 0x01, failsafe, LED blinking
---
# Robot does not drive

The board boots but the wheels stay still. The robot follows a gamepad, or an I2C master when no gamepad is
connected, and stops when neither has sent a command in the last 500 ms. When it does not boot at all, follow
[Board does not boot](board-does-not-boot.md) first.

1. Look at the LED on GPIO 2. Blinking once a second: no gamepad is connected. Steady on: a gamepad is connected.

## Causes

- **The LED blinks and you drive with a gamepad.** The sketch forgets every paired gamepad at each boot, so pair it
  again: put the gamepad in pairing mode. Expected: the LED turns steady on, and the sticks move the robot.
- **The LED blinks and you drive over I2C.** The master must write 16 bytes to address `0x01`: four little-endian
  `int32_t` values, the left stick's x and y, then the right stick's x and y. A write of any other length is
  dropped. It must write again within 500 ms, or the robot stops until the next write.
- **The LED is steady on and the robot still stands.** Push a stick past the dead zone, about 12% of its travel. If
  the wheels still stay still, check the motor drivers' power and wiring against the pin map in
  `sketches/omnidirectional/car.h`.
