---
description: Explains what the web-relay sketch does: an ESP-01S on a relay that blinks or holds a lamp, set from a page on its own hotspot.
audience: Whoever wires the relay, sets the lamp from a phone, calls its HTTP API, or changes its sketch
keywords: ESP-01S, ESP8266, relay, hotspot, 192.168.4.1, OTA, EEPROM, local.h
---
# Web relay

The board that runs `sketches/web-relay` switches a lamp through a relay: it blinks the lamp, or holds it on or off.
It is set from a web page the board serves on its own WiFi hotspot, so it works wherever it has 5 V and needs no
network.

## Boards

| Profile | Board | Relay | LED |
| --- | --- | --- | --- |
| `esp01`, the default | ESP-01S on an ESP-01 relay carrier | GPIO 0, on when LOW | GPIO 2, on when LOW |
| `esp32` | ESP32 DevKit | GPIO 23, on when HIGH | GPIO 2, on when HIGH |

The LED follows the lamp. The ESP-01S profile flashes in DOUT mode: the module cannot read its flash in the faster
QIO mode and restarts in a loop when asked to.

## Lamp

- **Mode** is `blink`, `on` or `off`. **Period** is how long the lamp holds each state while blinking, from 200 ms
  to one hour; a full blink is two periods.
- A board with nothing stored blinks with a 5 s period. Each blink is one click of the relay, which lasts some
  hundred thousand clicks, so a short period wears it out in weeks.
- The mode and period are stored when they change and restored at power-up.
- Entering blink mode waits one period before the first toggle.

## Hotspot and page

- The board never joins a network. It opens a WPA2 hotspot, `web-relay` with password `web-relay-1234`, and serves
  at <http://192.168.4.1>.
- `sketches/web-relay/local.h`, a file Git ignores, sets `WEB_RELAY_AP_SSID`, `WEB_RELAY_AP_PASSWORD` and
  `WEB_RELAY_OTA_PASSWORD`. The hotspot password is all that keeps a stranger in radio range from the lamp, so set
  one of at least 8 characters.

| Endpoint | Method | Parameter | Answer |
| --- | --- | --- | --- |
| `/` | GET | | The page |
| `/status` | GET | | `{"mode":"blink","period":5000,"lamp":false}` |
| `/mode` | POST | `mode=blink`, `on` or `off` | The status |
| `/period` | POST | `period=<ms>`, clamped to the range | The status |

An unknown mode or a period that is not a positive integer answers `400` with `{"error":"..."}`.

## Flashing

The first upload to an ESP-01S goes through a USB serial adapter, with the module out of the relay carrier. The
firmware then accepts uploads over the hotspot with ArduinoOTA, under the OTA password.

## Not handled

- A phone joined to the hotspot has no internet meanwhile, and the board has no clock, so the lamp follows no
  time of day.
- The serial monitor's DTR and RTS lines reset an ESP-01S in a bare CH340 adapter into its boot loader, which
  prints unreadable text at 74880 baud. Open the monitor with both lines off.
