---
description: Explains what the balance-beam sketch does: a beam two propellers hold at a target tilt with a PID loop, armed and tuned from a page or the serial port.
audience: Whoever builds, arms or tunes the balance beam, or changes its sketch
keywords: PID, MPU6050, ESC, brushless, ESP32-C3, hotspot, 192.168.4.1, tilt limit, throttle band, local.h
---
# Balance beam

The rig that runs `sketches/balance-beam` is a beam on a pivot with a brushless motor and propeller at each end. An
ESP32 reads the beam's tilt from an MPU6050 200 times a second and holds it at a target, level by default, by
speeding one propeller up and slowing the other. It has one axis, which makes it a small rig for learning to tune
P, I and D by hand.

**The propellers spin.** Work with them off or the beam clamped until the gains are trusted.

## Boards and wiring

| Profile | Board | I2C SDA, SCL | ESC 1, ESC 2 | Serial |
| --- | --- | --- | --- | --- |
| `wroom32`, the default | ESP32 WROOM-32 | GPIO 32, 33 | GPIO 16, 17 | USB bridge |
| `c3` | ESP32-C3 Super Mini | GPIO 2, 3 | GPIO 0, 1 | The chip's own USB |

- The MPU6050 sits on the beam, at I2C address `0x68`. The beam must be still for the second after power-up in
  which the sensor measures its gyroscope's bias.
- Each ESC gets pulses of 1000 µs to 2000 µs at 200 Hz, and the minimum pulse for the first 3 s, which arms it.
- The ESCs' supply goes through its own switch, the one sure way to stop the motors.
- `sketches/balance-beam/models/` holds the printed frame: a base, a tower that raises the pivot, the arm, and a
  motor plate for each end, as Fusion 360 sources and as STL and 3MF meshes.

## Arming and safety

- The board boots disarmed and drives no motor. Only the page arms and disarms it.
- Past the tilt limit, 45° by default, either way the motors stop and the board disarms; it stays so until armed again.
- A fresh build cannot spin a motor: the throttle band is zero until `local.h` or a setting stored on the board
  sets it.
- Arming clears the PID's integral, so error gathered while disarmed does not kick the beam.

## Settings

`sketches/balance-beam/local.h`, a file Git ignores, sets the rig's default values as `#define` lines. A value stored
on the board over the serial port, with `cfg set`, wins over its default, except `BALANCE_BEAM_BENCH_ENABLED`, which
only `local.h` sets:

| Name | `cfg` key | Default | Sets |
| --- | --- | --- | --- |
| `BALANCE_BEAM_THROTTLE_MIN` | `throttle_min` | `0.0f` | The throttle no motor goes below, as a fraction of the pulse range, from 0 to 1. Keep it at or above the throttle where the motors start to spin. |
| `BALANCE_BEAM_THROTTLE_MID` | `throttle_mid` | `0.0f` | The throttle both motors rest at while the beam is on target, from 0 to 1. |
| `BALANCE_BEAM_THROTTLE_MAX` | `throttle_max` | `0.0f` | The throttle no motor goes above, from 0 to 1. |
| `BALANCE_BEAM_TILT_LIMIT_DEG` | `tilt_limit_deg` | `45.0f` | The tilt past which the motors stop, above 0 and up to 90. |
| `BALANCE_BEAM_ANGLE_OFFSET_DEG` | `angle_offset_deg` | `0.0f` | The angle the sensor reads with the beam level, subtracted from every reading, from -30 to 30. |
| `BALANCE_BEAM_AP_SSID` | `ap_ssid` | `"balance-beam"` | The hotspot's name, 1 to 32 characters. |
| `BALANCE_BEAM_AP_PASSWORD` | `ap_password` | `"thebalancebot"` | The hotspot's password, up to 63 characters. A default shorter than 8 characters opens the hotspot; `cfg set` stores only 8 to 63 characters. `cfg get` prints it as `set` or `unset`. |
| `BALANCE_BEAM_BENCH_ENABLED` | none | `0` | `1` compiles in the bench commands. |

The throttles must satisfy `throttle_min` ≤ `throttle_mid` ≤ `throttle_max`. `cfg set` checks each throttle against
the other two's current values, stored or default, and answers `order` for a value that breaks the rule, so a band
that moves is sent in an order that keeps the rule at every step. `cfg get` shows the values the next boot uses. When
the stored and default throttles break the rule, the boot log says so and the board runs with a band of 0.

The website's flash card asks for the values that have a `cfg` key before it flashes the board, and sends them with the
`cfg` commands below.

The rig the sketch came from, with 1404 4600 KV motors on 3S and Gemfan 3523-3 propellers, balances with a band of
0.080 to 0.090 around 0.085. The loop starts with `kp` 0.002, `ki` 0 and `kd` 0.0008, in throttle per degree.

## Page

The board opens a hotspot and serves a page at <http://192.168.4.1>. The page shows the tilt and whether the board
is armed or tripped, arms and disarms, and sets the target tilt and the three gains. A target beyond the tilt limit
is clamped to it. Whoever joins the hotspot can arm the motors, so change the default password, which is public.

## Serial commands

At 115200 baud, one command per line. Every line the board prints, except the answers to `cfg` lines, goes through
the core's log, so each starts with a time, a level and a source position.

| Command | Does |
| --- | --- |
| `kp <v>`, `ki <v>`, `kd <v>` | Sets a gain |
| `sp <v>` | Sets the target tilt, in degrees |
| `?` | Prints the state: tilt, correction, throttles and gains |
| `cfg get`, `cfg set <key> <value>`, `cfg restart` | Reads and stores the settings above on the board by their `cfg` keys; `cfg set` is refused while armed, and a new value takes effect after the restart |

With `BALANCE_BEAM_BENCH_ENABLED` at 1, for work with the propellers off:

| Command | Does |
| --- | --- |
| `set motors_speed <m1> <m2>` | Sets each motor's bench throttle, from 0 to 1 |
| `set motors_enabled on` or `off` | Drives the motors at the bench throttles, or idles them; either stops balancing |
| `x` | Idles the motors |
| `run` | Leaves the bench and balances again |

The bench commands ignore the throttle band and the tilt limit. `sketches/balance-beam/tools/sweep.py` steps the
bench throttle and holds each step, to find where a motor starts to spin; `serial_dbg.py` sends one command or
captures the output.

## Not handled

- The tilt is computed for a sensor mounted with gravity on its +X axis when the beam is level and the pivot along
  its Z axis. A sensor mounted another way reads a wrong angle: build with the profile's `DebugLevel` at `debug`,
  which prints the raw readings ten times a second, and change the angle and rate in `balance-beam.ino`.
- An ESC that has learned a wrong pulse range spins late or not at all. Teach it the range with the bench commands:
  with the ESCs' switch off, send `set motors_speed 1 1` and `set motors_enabled on`, switch the ESCs on, and after
  their beeps send `set motors_speed 0 0`.
- A serial monitor opened after boot shows nothing until a command is sent, since the board prints only at boot and
  in answer to commands.
