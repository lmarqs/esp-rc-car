---
title: Hobby servo
summary: A motor that holds whatever angle you ask for, set by the width of a pulse.
family: Electronics
art: servo
level: beginner
state: draft
order: 3
---

A hobby servo has a motor, a gearbox, a sensor that knows the output's angle, and a small controller that keeps
turning until the angle matches the one asked for. It is asked with a pulse, sent 50 times a second: the pulse's
width says the angle.

The project's `PositionalServo` maps 0° to a 544 µs pulse and 180° to 2400 µs by default. A **continuous-rotation**
servo looks the same but reads the pulse width as speed and direction instead of angle; the project drives it with
`ContinuousServo`, where the middle pulse stops it.

The [Servo project](../../projects/servo/) lets you drag the angle and watch the pulse.

<div class="gap">

Wiring and power: why a servo usually needs its own supply.

</div>
