---
title: Balance beam
summary: A beam on a pivot that holds itself level with two propellers, an accelerometer and a PID loop on an ESP32.
art: scale
level: advanced
state: draft
order: 6
sketch: sketches/balance-beam
flash:
  baud: 115200
  next: "Join the WiFi hotspot named in the settings, balance-beam with the password thebalancebot by default, then open http://192.168.4.1. The motors stay off until you set the throttle band in the card's settings, which Change settings reopens."
topics: [pid, brushless-and-esc, imu, dual-core]
---

## What it does

A beam pivots at its middle like a weighing scale, with a brushless motor and a propeller at each end. An ESP32
reads the beam's tilt 200 times a second and holds it at a target, level by default, by speeding one propeller up
and slowing the other. It turns around one axis only, which makes it a small, safe-sized rig for learning to tune
a PID loop by hand.

- The board opens a WiFi hotspot and serves a page at <http://192.168.4.1> that shows the tilt, arms and disarms
  the motors, and has sliders for the target tilt and the three PID gains.
- It boots disarmed. Tilted past 45°, it stops the motors and disarms itself.

**The propellers spin fast.** Take them off, or clamp the beam, until you trust your gains. Put the ESCs' power
on its own switch: it is the one sure way to stop the motors.

## The parts

| Part | Role |
| --- | --- |
| ESP32 WROOM-32 or ESP32-C3 Super Mini | Runs the loop and the page. |
| MPU6050 | An accelerometer and gyroscope on the beam, read over I2C. It tells the tilt. |
| 2 brushless motors, each with an ESC | One at each end of the beam. The reference rig uses 1404 4600 KV motors. |
| 2 propellers | Gemfan 3523-3 on the reference rig. |
| LiPo battery, 3S | Powers the motors through the ESCs and their switch. |
| Printed frame | A base, a tower that raises the pivot, the arm, and a motor plate for each end. |

The frame's models are in the sketch's
[`models/`](https://github.com/lmarqs/robomania/tree/main/sketches/balance-beam/models) folder, as Fusion 360
sources and as STL and 3MF files ready to slice.

| Board | I2C SDA, SCL | ESC 1, ESC 2 |
| --- | --- | --- |
| ESP32 WROOM-32 | GPIO 32, 33 | GPIO 16, 17 |
| ESP32-C3 Super Mini | GPIO 2, 3 | GPIO 0, 1 |

## Run it on your board

The board bar at the bottom of the page flashes this sketch onto your board from Chrome or Edge on a computer, with no
tools installed. The card above asks for the throttle band, the angle offset, the tilt limit and the hotspot, and the site sends
them to the board.

To build and flash it yourself: a fresh build cannot spin a motor, since the range of throttle the loop may use is
zero until you set it. Put your rig's values in `sketches/balance-beam/local.h`, a file Git ignores. The reference
rig uses:

```cpp
#define BALANCE_BEAM_THROTTLE_MIN 0.080f
#define BALANCE_BEAM_THROTTLE_MID 0.085f
#define BALANCE_BEAM_THROTTLE_MAX 0.090f
#define BALANCE_BEAM_AP_PASSWORD "your-own-password"
```

Each throttle is a fraction of the ESC's range: `MIN` is where the motors just keep spinning, `MID` is where both
rest while the beam is on target, and `MAX` is the most the loop may ask for. Then, from the repository's root:

```sh
mise run arduino:run sketches/balance-beam --port /dev/ttyUSB0
```

Hold the beam still while the board starts: it measures the gyroscope's resting error for a second, then holds
the ESCs at their lowest pulse for three, which arms them. Join the `balance-beam` hotspot, open the page, and
press ARM.

The sketch compiles for both boards; uploading has not been tried from this repository yet. If a step fails, the
repository wants to hear about it.

## Tune it

Change the gains live with the page's sliders, or type `kp 0.003` on the serial port at 115200 baud.

1. Set `ki` and `kd` to 0. Raise `kp` until the beam pushes back toward level and swings a little around it.
2. Raise `kd` until the swing settles cleanly. Too much, and the motors buzz on the sensor's noise.
3. Add a little `ki` only if the beam rests at a steady angle away from level. Too much, and it hunts slowly back
   and forth.

The loop starts with `kp` 0.002, `ki` 0 and `kd` 0.0008, in throttle per degree.

## How the code works

Every 5 ms the control loop does four things:

```cpp
const float accelAngle = atan2f(sample.ay, sample.ax) * RAD_TO_DEG - settings.angleOffsetDeg;
balancer.setGains(gains);
last = balancer.step({accelAngle, -sample.gz, setpoint, dt, enabled});

esc1.write(last.active ? last.m1 : 0.0f);
esc2.write(last.active ? last.m2 : 0.0f);
```

1. **Read.** The accelerometer says which way gravity points, which gives the tilt. That reading is true on
   average and shaky from the motors' vibration. The gyroscope says how fast the beam is turning: smooth, and
   drifting when added up over time.
2. **Filter.** A complementary filter blends the two. It trusts the gyroscope for the last few milliseconds and
   lets the accelerometer pull the estimate back slowly, with 98% of the weight on the gyroscope.
3. **Correct.** The PID controller compares the tilt with the target and returns one number, the correction.
4. **Mix.** Motor 1 gets the resting throttle plus the correction, motor 2 the resting throttle minus it. One
   propeller pushes harder, the other softer, and the beam turns.

The filter, the PID controller, the sensor and the ESCs are drivers from the project's
[library](../../library/#pid_controller.h); the mixer and the arming rules belong to the sketch.

The loop runs in its own task, apart from the web server's. On the two-core WROOM-32 it has the second core to
itself, away from WiFi. On the one-core C3 it outranks the web server and sleeps between steps, so WiFi still gets
its turn. The page and the loop exchange values through a few variables guarded by a lock that is held only long
enough to copy them.

## Not handled

- The tilt is computed for a sensor mounted one particular way. Mounted another way it reads a wrong angle, and
  the code that turns readings into tilt needs changing. The sketch's page in the repository's docs says how to
  find the right axes.
- An ESC that has learned a wrong pulse range spins late or not at all, and needs its range taught again.
- Arming is on the page only. If the phone drops off the hotspot, use the ESCs' switch.

## Why it's built this way

**The derivative looks at the tilt, not the error.** When you move the target, the error jumps at once, and a
derivative taken on the error would kick the motors. The tilt itself cannot jump, so the D term stays calm.

**The integral is capped.** While a motor is already at the edge of its throttle range, more accumulated error
cannot push it further. The I term stops growing there, so it does not have a pile of old error to work off when
the beam comes back.

**The throttle range is zero until you set it.** Every motor and propeller starts spinning at a different
throttle, so no default is safe. A build that does nothing is.

**Arming clears the integral.** Error gathered while the beam hung disarmed says nothing about the beam in flight.
