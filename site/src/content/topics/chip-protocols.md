---
title: SPI, UART and I2C
summary: The three common ways chips talk to each other, with the wires each one needs.
family: Electronics
art: signal
level: intermediate
state: coming
order: 5
---

<div class="gap">

UART: two wires, no clock, both sides agree on the speed. Where a sketch's serial output travels.

</div>

<div class="gap">

I2C: two wires shared by many devices, each with an address. The omnidirectional robot listens at address `0x01`.

</div>

<div class="gap">

SPI: a clock, a line each way and a select line per device. Fast, and used by displays and SD cards.

</div>
