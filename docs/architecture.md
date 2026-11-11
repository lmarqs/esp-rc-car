---
description: Maps how the sketches, the drivers in lib/ and the ESP32 core fit together.
audience: Whoever adds a driver or a sketch, or changes how they connect
---
# Architecture

Each sketch in `sketches/` is one firmware image: arduino-cli builds it with every source in `lib/` and with the
Bluepad32 ESP32 core that its `sketch.yaml` pins. The [README](../README.md#code-layout) lists the drivers.

## Pins and the drivers on them

`lib/pin.h` declares the interfaces drivers take their pins through: `InPin` and `OutPin` for levels, and `PwmOutPin`
for a square wave whose duty runs from 0 to `PwmOutPin::DUTY_MAX`.

| Interface | Pin classes |
| --- | --- |
| `InPin` | `DigitalInPin` in `digital_pin.*`, `AnalogInPin` in `analog_pin.*` |
| `OutPin` | `DigitalOutPin` in `digital_pin.*`, `AnalogOutPin` in `analog_pin.*` |
| `PwmOutPin` | `EspLedcOutPin` in `ledc_pin.*` |

Drivers depend on the interfaces, never on a pin class: `FullHBridge` takes one `PwmOutPin` and two `OutPin`s,
`HalfHBridge` two `PwmOutPin`s, and each `Servo` one `PwmOutPin`. A sketch picks the pin classes and passes them in,
as `sketches/servo/servo.ino` does.

`camera*`, `ledc_pin.*` and `web_server.*` call ESP-IDF and build only for ESP32; the other drivers use only the
Arduino API.
