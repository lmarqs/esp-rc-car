---
title: Timers and LEDC
summary: How the ESP32 makes many PWM signals in hardware, and the rule that makes channels share.
family: Inside the ESP32
art: chip
level: advanced
state: draft
order: 1
---

The ESP32's LEDC peripheral generates PWM signals in hardware: once set up, a signal keeps running while the CPU does
other work. Each signal comes from a **channel**, and each channel counts on a **timer**, which sets the frequency
and the resolution.

The catch: the Arduino core drives channels in pairs, 2k and 2k + 1, from one timer, so both channels of a pair must
run at the same frequency and resolution. The project's `EspLedcOutPin` driver handles this when it starts: it picks
a channel whose pair is free, or already runs at the same frequency and resolution, counting up from channel 0.

That is why the omnidirectional robot's four motors, all at 5 kHz and 12 bits, fit neatly into pairs, while the
camera, whose clock needs a timer of its own, reserves a whole timer with `ledcReserveTimer()`.

<div class="gap">

How many channels and timers each ESP32 model has, and what happens when they run out.

</div>
