---
title: DC motor and PWM speed
summary: How a microcontroller sets a motor's speed by switching it on and off thousands of times a second.
family: Electronics
art: motor
level: beginner
state: draft
order: 1
example: motor
---

A brushed DC motor spins faster the more voltage it gets. A microcontroller pin, though, is either fully on or fully
off. PWM, pulse-width modulation, bridges the two: the pin switches on and off so fast that the motor only feels the
average. On for 40% of each period, the motor runs about as if it got 40% of the voltage.

That share of time on is the **duty cycle**. Drag it in the example above: the waveform's on-time grows and the motor
speeds up, with a lag, because a real motor has inertia.

In the [omnidirectional robot](../../projects/omnidirectional/), each motor's PWM runs at 5 kHz, a period of 200 µs,
and full speed is capped at an 80% duty cycle.

A pin cannot power a motor by itself: it gives a few milliamps, and a motor wants far more. The pin's PWM signal
goes to a driver, usually an [H-bridge](../h-bridge/), which switches the motor's own power supply.

<div class="gap">

Choosing a motor: voltage, current, gear ratio, and what happens at stall.

</div>
