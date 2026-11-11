---
title: PWM signals
summary: One pin, switched on and off on a schedule, to dim an LED, set a motor's speed or point a servo.
family: Electronics
art: signal
level: beginner
state: draft
order: 4
---

PWM is a square wave with two settings: how often it repeats, the **frequency**, and how long it stays on in each
period, the **duty cycle**. The same signal does different jobs depending on what reads it:

- An LED or a motor reacts to the average: more on-time is brighter or faster. See [DC motor](../dc-motor/).
- A servo reads the width of each pulse as an angle. See [Hobby servo](../servo/).

On the ESP32, PWM comes from a hardware block called LEDC, which keeps the signal running while your code does other
things. [Timers and LEDC](../ledc-timers/) explains how the project shares it out.
