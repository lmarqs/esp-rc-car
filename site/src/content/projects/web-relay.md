---
title: Web-controlled relay
summary: An ESP-01 and a relay that switch a lamp on and off from a page on your phone.
art: relay
level: beginner
state: draft
order: 5
sketch: sketches/web-relay
flash:
  baud: 115200
  next: "Join the WiFi hotspot named in the settings, web-relay with the password web-relay-1234 by default, then open http://192.168.4.1 to set the lamp."
topics: [web-server, esp-boards]
---

## What it does

The board switches a lamp through a relay: it blinks the lamp, or holds it on or off. You set it from a web page
on your phone, and it remembers the setting through a power cut.

- The board opens its own WiFi hotspot, `web-relay`. Join it and open <http://192.168.4.1>.
- The page has three buttons, Blink, On and Off, and a field for the blink period, from 200 ms to one hour.
- A new board blinks every 5 seconds.

## The parts

| Part | Role |
| --- | --- |
| ESP-01S | A stamp-sized ESP8266 board with WiFi and two usable pins. It runs the sketch. |
| ESP-01 relay carrier | A relay board with a socket for the ESP-01S and a 5 V input. The relay switches the lamp. |
| USB serial adapter for the ESP-01 | Uploads the sketch the first time. |

The relay is on GPIO 0 and switches on when the pin is LOW. The ESP-01S's blue LED, on GPIO 2, follows the lamp.

The relay switches mains voltage. Wire the lamp's side with the plug out, and close the carrier in a box before
it is powered.

The same sketch builds for an ESP32 DevKit, with the relay on GPIO 23, which is handy on the bench: the DevKit
uploads over its own USB port.

## Run it on your board

Put the ESP-01S in its USB adapter and set the adapter's switch to PROG, the flash position, or put its jumper on,
before you plug the adapter in. The board bar at the bottom of the page flashes this sketch onto your board from
Chrome or Edge on a computer, with no tools installed. After the write, it asks you to set the switch to UART, the run
position, and to unplug the adapter and plug it back in. When you connect again, it sends the card's settings to the
running board. To build and flash it yourself, install the tools (the [tooling
page](../../learn/tooling/) says how) and run, from the repository's root:

```sh
mise run arduino:run sketches/web-relay --port /dev/ttyUSB0
```

Then move the ESP-01S to the relay carrier and power the carrier with 5 V.

The hotspot's password is `web-relay-1234` until you set your own: in the card's settings, or, when you build
it yourself, in `sketches/web-relay/local.h`, a file Git ignores:

```cpp
#define WEB_RELAY_AP_PASSWORD "at-least-8-characters"
```

The sketch compiles for both boards; uploading has not been tried from this repository yet. If a step fails, the
repository wants to hear about it.

## How the code works

The sketch keeps three things apart: deciding what the lamp does, talking to the phone, and driving the pins.

**Deciding.** `BlinkController` holds the mode and the period, and is told the time on every pass of `loop()`:

```cpp
static void tick() {
  if (!blinker.update(millis())) {
    return;
  }
  applyOutput();
  logLamp();
}
```

`update()` returns true only when the lamp should change, so the relay is written only then. The controller never
reads a clock or touches a pin itself: it is handed the time and answers on or off.

**Talking.** The board's web server answers four addresses: `/` sends the page, `/status` reports the mode, the
period and the lamp as JSON, and `/mode` and `/period` change the setting. When you press a button, the page posts
to one of them and shows the status that comes back.

```cpp
server.on("/", HTTP_GET, handleIndex);
server.on("/status", HTTP_GET, sendStatus);
server.on("/mode", HTTP_POST, handleMode);
server.on("/period", HTTP_POST, handlePeriod);
```

A request is accepted, rejected or leaves things unchanged. Only an accepted one drives the relay and stores the
setting, so pressing On twice writes nothing the second time.

**Remembering.** The setting is stored in the board's flash with a marker byte and a version in front. At power-up
the sketch reads it back, and when the marker or version is wrong, as on a new board, it keeps the 5 second blink.

## Not handled

- A phone joined to the hotspot has no internet meanwhile.
- The board has no clock, so the lamp cannot follow the time of day.
- Anyone in radio range who knows the hotspot's password can switch the lamp. Set your own password.

## Why it's built this way

**Its own hotspot, never your WiFi.** A board that joins the home network needs that network's password stored
somewhere, a way to enter it, and a way to reset it. A board that is its own hotspot needs none of that and works
anywhere it has 5 V. The price is that your phone leaves the internet while it is joined, which is fine for
changing a setting now and then.

**A 5 second blink by default.** Every blink is one click of a mechanical relay, and a relay lasts some hundred
thousand clicks. At 5 seconds it blinks for months; at half a second it would wear out in weeks.

**The lamp goes off first.** On the ESP-01S the relay shares GPIO 0 with the pin that chooses between running and
flashing at reset. The sketch sets the outputs before anything else, so the relay settles as soon as the board is
up.
