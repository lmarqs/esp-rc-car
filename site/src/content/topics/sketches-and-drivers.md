---
title: Sketches and drivers
summary: How the code is split, so one driver serves every robot.
family: Programming
art: layers
level: intermediate
state: draft
order: 2
---

The code has three layers, and each depends only on the ones below it:

- **Sketches**, one folder each under `sketches/`, or under a project's folder when a project has steps, such as
  `sketches/blink/simple`. A sketch is one firmware image. It says which device sits on which pin and holds its
  robot's control logic.
- **Drivers**, in `lib/`. Each runs one sort of device, such as a motor, a servo or a camera, or serves one
  protocol. Every sketch builds with the same library. The [Library](../../library/) page shows them all.
- **Pin interfaces**, also in `lib/`: the kinds of output a driver can ask for, such as a level or a PWM signal.

A driver reaches the hardware only through a pin interface, so the H-bridge driver does not care whether its PWM
comes from the ESP32's LEDC hardware or from Arduino's `analogWrite()`. Under all of them sits the ESP32 Arduino
core, which brings the Arduino API, ESP-IDF and the Bluetooth gamepad stack.

<div class="gap">

Why the drivers live in one shared library instead of inside each sketch.

</div>
