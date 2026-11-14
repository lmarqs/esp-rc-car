# Flashing an ESP board from a phone browser

Researched on 2026-11-14 for the site's flasher (`site/src/lib/flash/`, esptool-js 0.7.1 over Web Serial).
Everything below comes from documentation and source code. **Nothing was run on a phone or a board**, so every
"works" is a reading of the sources, to be confirmed on hardware before the site promises it.

## Verdict

| Platform | Verdict | Condition |
| --- | --- | --- |
| Android, Chrome 148+, Android 17, native Web Serial | Works with conditions | The phone maker must enable Android's serial service, and the kernel must carry the driver for the board's USB chip. No site change. |
| Android, Chrome 61+, WebUSB, CH340 (ESP-01S adapter, CH340 dev boards) | Works with conditions | Site change: use esptool-js's `WebUSBSerialPort`. Any Android version with USB host. |
| Android, Chrome 61+, WebUSB, ESP32-C3 native USB (CDC) | Works with conditions | Site change: add `web-serial-polyfill` (archived, CDC-ACM only). |
| Android, Chrome 61+, WebUSB, CP2102 or FTDI boards | Impossible with esptool-js 0.7.1 | Neither esptool-js nor the polyfill has a driver for them. Another project, esp32tool, has its own. |
| Android, Firefox | Impossible | No Web Serial, no WebUSB. |
| iOS and iPadOS, every browser | Impossible | WebKit has neither API and opposes both. |
| Bluetooth, any phone | Impossible for flashing | The ROM bootloader listens on UART and USB only. |

## 1. Web Serial on phones

- **Chrome for Android 148** (stable on 2026-05-05) ships the Web Serial API for wired ports. The release note
  says "Now it is supported on Android."
  [Chrome 148 release notes](https://developer.chrome.com/release-notes/148),
  [chromestatus entry](https://chromestatus.com/feature/6043992171085824),
  [Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/HBJ-uYFvkpM).
  MDN's compatibility data agrees: `chrome_android` full support from 148, and from 138 to 148 a partial
  implementation where "Serial ports are only available if they're provided by Bluetooth RFCOMM serial port
  emulation."
  [browser-compat-data `api/Serial.json`](https://github.com/mdn/browser-compat-data/blob/main/api/Serial.json).
- **It needs Android 17 (API level 37).** Chromium's Android enumerator returns no ports below SDK 37:
  `SerialDeviceEnumeratorAndroid::IsSupported()` compares `sdk_int()` with `SDK_VERSION_CINNAMON_BUN` and logs
  "Android Serial Service requires SDK 37".
  [serial_device_enumerator_android.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/services/device/serial/serial_device_enumerator_android.cc).
  It wraps the platform's new `android.hardware.serial.SerialManager`, "Added in API level 37".
  [SerialManager reference](https://developer.android.com/reference/android/hardware/serial/SerialManager),
  [ChromeSerialManager.java](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/services/device/serial/android/java/src/org/chromium/device/serial/ChromeSerialManager.java).
- **The phone maker must switch it on.** Android's `SerialManagerService` returns an empty list unless
  `config_supportNativeSerialService` is true, and AOSP's default is `false`.
  [SerialManagerService.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android17-release/services/serial/java/com/android/server/serial/SerialManagerService.java),
  [config.xml](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android17-release/core/res/res/values/config.xml).
  A Chrome engineer said the same in the intent thread: "only devices configured to expose wired serial ports
  will return non-empty lists of serial ports."
  **Not verified:** which phones (Pixel included) set it to true.
- **The kernel must have a driver for the USB chip.** The service exposes kernel tty nodes ("the dev node name
  under /dev, e.g. ttyUSB0, ttyACM1") and hides built-in UARTs.
  [SerialPort.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android17-release/core/java/android/hardware/serial/SerialPort.java),
  [SerialDeviceFilter.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android17-release/services/serial/java/com/android/server/serial/SerialDeviceFilter.java).
  Android's generic kernel config builds `CONFIG_USB_ACM`, `CONFIG_USB_SERIAL` and `CONFIG_USB_SERIAL_FTDI_SIO`
  as modules and has no entry for CP210x or CH341 (checked on `android14-6.1`, `android15-6.6`,
  `android16-6.12`, `android17-6.18`).
  [gki_defconfig, android17-6.18](https://android.googlesource.com/kernel/common/+/refs/heads/android17-6.18/arch/arm64/configs/gki_defconfig).
  Inference: the ESP32-C3's native USB (CDC-ACM) and FTDI bridges have a generic driver, while CP2102 and CH340
  depend on the phone maker adding one. **Not verified** on any phone.
- **Opening a port asks the user.** `requestOpen` fails with `SecurityException` "if the user rejects the open
  request" (same `SerialPort.java`).
- **Other Android browsers.** Firefox for Android: `version_added: false`. Samsung Internet and Opera for
  Android are listed as mirroring Chrome, which is derived data, **not verified** against those vendors.
  Android WebView: not supported (same `Serial.json`).
- **Web Serial over Bluetooth** exists in Chrome for Android since 138 (RFCOMM, see above). It cannot flash:
  see section 4 on what the bootloader listens to.
- **Desktop note.** Firefox 151 added Web Serial on desktop (same `Serial.json`); the site's wording names only
  Chrome and Edge.

## 2. WebUSB on phones, and which chips it can drive

- **Chrome for Android has WebUSB since 61**; Firefox, Safari and Android WebView do not.
  [browser-compat-data `api/USB.json`](https://github.com/mdn/browser-compat-data/blob/main/api/USB.json).
- WebUSB gives raw USB transfers, so a page needs a driver in JavaScript for each chip family:

| Chip | USB class | Driver available in JavaScript |
| --- | --- | --- |
| ESP32-C3 USB-Serial-JTAG | CDC-ACM ("the CDC-ACM portion of the controller implements a serial port") | `web-serial-polyfill` |
| CH340, CH341 | vendor class 0xFF | esptool-js 0.7.x `WebUSBSerialPort` |
| CP2102 | vendor class | none in esptool-js or the polyfill; esp32tool has one |
| FTDI | vendor class | none in esptool-js or the polyfill; esp32tool lists it as "not tested" |

  Sources:
  [ESP32-C3 USB Serial/JTAG console](https://docs.espressif.com/projects/esp-idf/en/stable/esp32c3/api-guides/usb-serial-jtag-console.html),
  [web-serial-polyfill `serial.ts`](https://github.com/google/web-serial-polyfill/blob/main/serial.ts),
  [esptool-js `src/webusb.ts`](https://github.com/espressif/esptool-js/blob/main/src/webusb.ts),
  [esp32tool WEBUSB-ANDROID-NOTES.md](https://github.com/Jason2866/esp32tool/blob/main/WEBUSB-ANDROID-NOTES.md).
- **`web-serial-polyfill`** implements Web Serial on WebUSB for CDC-ACM only: it looks for a control interface of
  class 2 and a data interface of class 10 and throws `Unable to find interface with class …` otherwise, and it
  sets DTR and RTS with the CDC `SET_CONTROL_LINE_STATE` request. Version 1.0.15; the repository was archived
  on 2025-01-23 and last pushed in November 2023.
  [README](https://github.com/google/web-serial-polyfill), `serial.ts` as above.
- **A kernel driver holding the device** is the usual blocker for WebUSB on desktop; esptool-js's own error
  text says "On desktop OS the kernel driver often owns the device". Android's USB host API can take the
  interface away from a kernel driver (`claimInterface(intf, force)`: "true to disconnect kernel driver if
  necessary").
  [UsbDeviceConnection](https://developer.android.com/reference/android/hardware/usb/UsbDeviceConnection).
  **Not verified:** that Chrome passes `force`. esp32tool's report of CH340 and CP2102 working on Android
  suggests the claim succeeds.

## 3. esptool-js 0.7.x over each route

- **Native Web Serial (Chrome 148+, Android 17):** the same `Transport(port)` path the site uses today. Chrome's
  Android IO handler subclasses the POSIX one, so DTR and RTS are driven as on Linux (inference from
  [serial_io_handler_android.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/services/device/serial/serial_io_handler_android.cc)).
  No report of esptool-js on this route was found.
- **WebUSB, CH340:** esptool-js 0.7.1 exports `WebUSBSerialPort` (the file's first commits and the 0.7.0 release
  are both dated 2026-09-21; 0.7.0's own contents were not inspected): a "SerialPort-compatible WebUSB adapter for WCH CH340/CH341" with `open`, `close`, `setSignals`,
  `setBaudRate`, `getInfo`, `readable`, `writable` and `asSerialPort()` for `Transport`. Its `requestPort()`
  filters on vendor `0x1a86` and rejects the CH343 (a CDC device). The upstream example offers it behind a
  "use WebUSB" checkbox.
  [src/webusb.ts](https://github.com/espressif/esptool-js/blob/main/src/webusb.ts),
  [example `index.ts`](https://github.com/espressif/esptool-js/blob/main/examples/typescript/src/index.ts),
  and `node_modules/esptool-js/lib/webusb.d.ts` in the installed 0.7.1.
  It was added for baud-rate changes on CH340 (commit "Bugfix change baudrate for CH340 (#265)"), and nothing
  upstream states it was tested on Android. **Not verified** on a phone.
- **WebUSB, CDC (ESP32-C3):** the esptool-js README says it works on "Google Chrome on Android version 61 or
  later via the web-serial-polyfill compatibility layer", and the example pages gained it in
  [pull request 144](https://github.com/espressif/esptool-js/pull/144) (merged 2024-05-31).
  [README](https://github.com/espressif/esptool-js/blob/main/README.md).
  Open bug: [issue 199, "In Android Chrome, it is not possible to disconnect."](https://github.com/espressif/esptool-js/issues/199)
- **WebUSB, CP2102 and FTDI:** not possible with esptool-js 0.7.1 (table in section 2).
- **A stale check upstream.** The example picks the polyfill with `!navigator.serial && navigator.usb`. Since
  Chrome for Android 138 exposes `navigator.serial`, that test no longer selects the polyfill there
  (inference from the two sources; not run).
- **Projects that flash from Android Chrome.** [esp32tool](https://github.com/Jason2866/esp32tool) (active,
  pushed 2026-11-12; not built on esptool-js) installs as a PWA and "works with USB OTG adapters via WebUSB",
  requiring Android 5.0+ and Chrome 61+. Its notes list as working: native USB on ESP32-S2, S3, C3, C5, C6, H2,
  and CH343, CH340, CP2102 bridges; FTDI "not tested". These are that project's own claims.

## 4. What is impossible, and why

- **iOS and iPadOS.** Safari has neither API (`safari` and `safari_ios`: `version_added: false` in both BCD
  files). WebKit's position is "oppose" for
  [Web Serial](https://github.com/WebKit/standards-positions/issues/199) (concerns: privacy, security, use
  cases, device independence) and for [WebUSB](https://github.com/WebKit/standards-positions/issues/68).
  Every browser on iOS must use WebKit: App Review guideline 2.5.6, "Apps that browse the web must use the
  appropriate WebKit framework and WebKit JavaScript", with an entitlement for other engines in the EU and
  Japan only.
  [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/),
  [alternative browser engines](https://developer.apple.com/support/alternative-browser-engines/).
  **Not verified:** whether any browser with another engine and Web Serial or WebUSB ships in those regions.
- **Flashing over Bluetooth.** The ROM bootloader's download modes are UART, USB and SDIO
  ("DOWNLOAD(USB/UART0)"), so Chrome's Bluetooth serial ports do not reach it.
  [esptool boot mode selection](https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/boot-mode-selection.html).
- **Firefox for Android.** Neither API (both BCD files).

## 5. Hardware the reader needs

- **A phone that is a USB host.** "When your Android-powered device is in USB host mode, it acts as the USB
  host, powers the bus, and enumerates connected USB devices"; "not all Android-powered devices are guaranteed
  to support the USB host APIs".
  [Android USB host](https://developer.android.com/develop/connectivity/usb/host).
- **A data cable that makes the phone the host:** USB-C to the board's connector, or a USB OTG adapter for a
  USB-A plug such as the ESP-01S adapter's. esp32tool lists a "USB OTG adapter/cable" as a requirement.
- **Power.** The phone powers the board. Espressif asks for a supply of "no less than 500 mA" for an ESP32.
  [ESP32 schematic checklist](https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32/schematic-checklist.html).
  **Not verified:** how much current a given phone's port delivers; a powered USB hub is the fallback when the
  board browns out. The RC car's motors need their own supply in any case.
- **Entering the bootloader.** Auto-reset needs DTR wired to GPIO0 and RTS to EN. An ESP-01S adapter without
  that wiring needs GPIO0 held low during reset, on a phone as on a computer.
  [esptool boot mode selection](https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/boot-mode-selection.html).
- **HTTPS.** Web Serial and WebUSB need a secure context.
  [MDN Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API).

## What the site's code would need to change

Today `createFlasher()` returns an `EsptoolFlasher` when `'serial' in navigator`, and `EsptoolFlasher` calls
`navigator.serial.requestPort()` itself in `connect()` (line 121) and `attach()` (line 143).

**Route A, native Web Serial: no code change.** Chrome 148+ on Android 17 passes the existing check and uses
the existing path. Two things to handle:

- The check also passes on Chrome for Android 138+ on Android 16 and older, where no wired port can appear.
  The reader then gets a port picker that never lists the board. **Not verified:** what that picker shows. No
  API tells a page whether wired serial is enabled, so the site cannot detect this case up front.
- `USE_CHROME_OR_EDGE` in `site/src/lib/flash/wording.ts` says "Open this page in Chrome or Edge on a
  computer." and needs to name the phone conditions once a route is confirmed.

**Route B, WebUSB with esptool-js's `WebUSBSerialPort` (CH340 only):**

1. `flasher.ts`: replace the two `navigator.serial.requestPort()` calls with a port source passed in
   `EsptoolFlasherOptions`, typed to return a `SerialPort`. The rest of the class already uses only what
   `WebUSBSerialPort` provides: `open`, `close`, `setSignals`, `readable`, `writable`, and `Transport`.
2. Keep the user-activation rule the comment at line 119 states: ask for the device before the dynamic
   `import('esptool-js')`. `WebUSBSerialPort.requestPort()` lives inside that import, so call
   `navigator.usb.requestDevice({ filters: [{ vendorId: 0x1a86 }] })` first and wrap the result with
   `new WebUSBSerialPort(device).asSerialPort()` after the import; the constructor is public for this.
3. `createFlasher.ts`: choose the source. `'usb' in navigator` is true on desktop Chrome too, where Web Serial
   is the right route, so the choice needs either the reader's pick (as the upstream example's checkbox) or an
   Android check; `'serial' in navigator` alone no longer separates phone from computer.
4. `monitor()` closes the transport and reopens the port at the sketch's baud; with the adapter that is a USB
   close and re-claim. `RECOVERABLE_READ_ERRORS` names Web Serial errors the adapter never raises, which is
   harmless. Both need a run on a phone.
5. Add `@types/w3c-web-usb` if the type-check asks for it, and cover the new source in the Playwright fake.

**Route C, WebUSB with `web-serial-polyfill` (ESP32-C3 native USB):** add the dependency and use its
`serial.requestPort()` as the port source from step 1. It is an archived package and esptool-js issue 199 is
open against this route.

**Out of reach without leaving esptool-js:** CP2102 and FTDI boards over WebUSB, which is the common ESP32
dev board. For those, only Route A helps, and only on phones whose kernel has the driver.

## Not verified

- Any route on a real phone and board.
- Which Android 17 phones enable `config_supportNativeSerialService`, and which load `cdc-acm`, `ftdi_sio`,
  `cp210x` or `ch341`.
- What Chrome's port picker shows on Android 16 and older.
- That Chrome for Android detaches a kernel driver when a page claims a USB interface.
- Web Serial in Samsung Internet, Opera for Android and Edge for Android.
- That the ESP32-C3 and ESP8266 lack Bluetooth Classic (not looked up; it does not change the verdict, since
  the bootloader has no Bluetooth download mode).
- Current a phone's USB port supplies.
