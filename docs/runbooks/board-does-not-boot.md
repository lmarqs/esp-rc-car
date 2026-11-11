---
description: Finds why a flashed ESP32 does not start its sketch, with the boot log each check should print.
audience: Whoever flashed a sketch and sees the board do nothing
keywords: invalid header, no serial output, ttyUSB0, POWERON_RESET, GPIO 12, strapping pin
---
# Board does not boot

The sketch never starts: no LED, no motors, no serial output. The boot log tells the causes apart.

1. Find the board: `mise exec -- arduino-cli board list`. Expected: a line such as `/dev/ttyUSB0 serial Serial Port
   (USB)`. With no line, the board or its cable is not connected; reconnect it and list again.
2. Open the monitor at the boot ROM's speed: `mise run arduino:monitor --port /dev/ttyUSB0 --baudrate 115200`, then
   press the board's EN button. Expected, within a second:

   ```text
   rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)
   ...
   entry 0x400805f0
   ```

   The omnidirectional sketch then prints `Bluepad32 (C) 2016-2024 Ricardo Quesada and contributors.` and
   `BTstack up and running at` with the board's address.

## Causes

- **The monitor shows nothing, or garbage.** Check the speed is 115200: the monitor's default of 9600 garbles the
  boot log. With nothing at all, your user may lack access to the port: on Debian and Ubuntu, join the `dialout`
  group and log in again.
- **The log stops before `entry`, or repeats.** The board reads GPIO 12 at reset, and when it is held high the
  ESP32 runs its flash at the wrong voltage. The omnidirectional sketch wires GPIO 12 to motor 4's H-bridge, in
  `sketches/omnidirectional/car.h`. Unplug the motor driver and press EN: a full boot log confirms the cause, and the
  driver must leave GPIO 12 low at reset.
- **The log reaches `entry` and then the board resets again, printing `Guru Meditation Error`.** The sketch crashes
  in `setup()` or `loop()`; the backtrace under that line names the function.
