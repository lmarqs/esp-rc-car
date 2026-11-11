---
title: RTOS and HAL
summary: The operating system and the hardware layer underneath every sketch.
family: Inside the ESP32
art: layers
level: advanced
state: coming
order: 2
---

A sketch is not alone on the chip. Under it sit layers, each hiding the one below:

- **Applications**: your sketch, and the libraries it calls.
- **Kernel**: FreeRTOS, which runs several tasks and decides which runs when.
- **HAL**, the hardware abstraction layer: the same calls whatever the chip's registers look like.
- **Hardware**: CPU, memory, timers, ports and devices.

<div class="gap">

What `setup()` and `loop()` really are inside FreeRTOS, and when a sketch needs a task of its own.

</div>
