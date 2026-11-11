---
title: PID control
summary: How a robot closes the gap between where it is and where it wants to be, without overshooting.
family: Control
art: wave
level: advanced
state: coming
order: 1
---

A PID controller looks at the error, the gap between where the robot is and where it should be, three ways:

- **P**, proportional: push in proportion to the error now.
- **I**, integral: push in proportion to the error added up over time, to remove a gap that P alone leaves.
- **D**, derivative: push against how fast the error is changing, to stop before overshooting.

<div class="gap">

A playable example: tune P, I and D and watch a system settle, overshoot or oscillate.

</div>

<div class="gap">

PID in the balance beam and the drone, and how to tune it.

</div>
