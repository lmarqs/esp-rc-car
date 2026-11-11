---
title: Two cores, many tasks
summary: The ESP32 runs code on two cores at once, and why that makes shared data dangerous.
family: Inside the ESP32
art: chip
level: advanced
state: coming
order: 3
---

In the [omnidirectional robot](../../projects/omnidirectional/), the I2C handler runs in a different task from
`loop()`. Both write the latest drive command, so the code guards it with a mutex: a lock that lets one task in at a
time.

<div class="gap">

Which core runs what, and how Bluetooth and Wi-Fi share the chip with your sketch.

</div>
