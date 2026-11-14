# Flashing an Arduino Nano from the browser

Researched on 2026-11-14 for [issue #42](https://github.com/lmarqs/robomania/issues/42), beside the site's ESP flasher
(`site/src/lib/flash/`, esptool-js 0.7.1 over Web Serial). The Tank project runs on an Arduino Nano (ATmega328P),
likely a clone with a CH340 USB chip and possibly the old bootloader, with an HC-05 module.

**No board was attached. Nothing was flashed.** Each claim carries how it was checked:

- **(docs)**: read in documentation or a specification.
- **(source)**: read in the code that owns the behaviour.
- **(run)**: run here: a compile, a bundle, a type-check, or the spike against a simulated bootloader.

## Verdict

Yes. Chrome or Edge on a computer can flash a Nano over Web Serial: it can set the baud rate, toggle DTR for the
auto-reset and exchange STK500v1 bytes with Optiboot or the old bootloader. None of the existing JavaScript libraries
is maintained and ready for the browser. The site would carry its own STK500v1 module, about 250 lines and 1.8 KB
gzipped, written as the spike in `research/arduino-nano-spike/` shows.

| Question | Answer |
| --- | --- |
| Browser and protocol | Web Serial does everything the Arduino `-c arduino` upload needs (docs, source). |
| Libraries | avrgirl-arduino, avrbro, web-arduino-uploader and stk500 last released between 2020 and 2024. Each one needs Node polyfills or has protocol bugs (source, run). The recommendation is an in-house module (run, simulated). |
| Input | Intel HEX. arduino-cli already writes `<sketch>.ino.hex`, and the same file works with both bootloaders (run). |
| Old or new bootloader | The site tries 115200 baud (Optiboot), then 57600 (old bootloader), with a fresh reset for each (source, run, simulated). |
| Chrome or Edge on a computer | Works (docs; not run on a board). |
| Android, CH340 clone | Only over WebUSB, through esptool-js 0.7.1's `WebUSBSerialPort`, which the spike's port type accepts (run: type-check). Web Serial needs a CH341 kernel driver, which Android's generic kernel lacks ([#23](https://github.com/lmarqs/robomania/issues/23)). |
| Android, genuine Nano (FT232RL) | Web Serial on Android 17 with Chrome 148, under the conditions in #23. No WebUSB driver exists for FTDI in esptool-js. |
| iOS, Firefox for Android | Impossible, as in #23. |

## 1. Can a browser speak to the Nano's bootloader?

### What the upload needs

- **Protocol and speed.** `arduino:avr:nano` uploads with `upload.protocol=arduino` (avrdude's `-carduino`, STK500v1)
  at `upload.speed=115200`. The old-bootloader menu entry, `cpu=atmega328old`, uses 57600 (source:
  [boards.txt](https://github.com/arduino/ArduinoCore-avr/blob/master/boards.txt), lines `nano.menu.cpu.*`; run:
  `arduino-cli compile --show-properties` on arduino:avr 1.8.8 printed `-patmega328p -carduino -b115200 -D
  -Uflash:w:<sketch>.ino.hex:i`, and `upload.speed=57600` for `cpu=atmega328old`).
- **Which bootloader is which.** The 115200 entry burns `optiboot/optiboot_atmega328.hex`. The 57600 entry burns
  `atmega/ATmegaBOOT_168_atmega328.hex`, built with `-DBAUD_RATE=57600` (source: boards.txt;
  [bootloaders/atmega/Makefile](https://github.com/arduino/ArduinoCore-avr/blob/master/bootloaders/atmega/Makefile)).
  ArduinoCore-avr added the Optiboot menu for the Nano on 2018-02-19 (source: commit `1b14cc0733`, "Add menu for
  Nano with Optiboot bootloader"). Forum posts say Arduino moved its own Nanos to Optiboot around then and clones
  ship either one. **Not verified** against a primary source.
- **Reset.** avrdude 8.0's `arduino_open` releases DTR and RTS, waits 250 ms, asserts them, releases them after
  100 µs, then waits 100 ms. Before each sync retry it pulses them again (source:
  [src/arduino.c at v8.0](https://github.com/avrdudes/avrdude/blob/v8.0/src/arduino.c),
  [src/stk500.c `stk500_getsync`](https://github.com/avrdudes/avrdude/blob/main/src/stk500.c)). On the Nano, DTR
  reaches RESET through a 100 nF capacitor (docs, secondary: Wikipedia's Arduino Nano article and DFRobot's DFR0010
  page; **the Nano schematic was not read**).
- **Optiboot runs only after an external reset.** It checks `MCUSR` for `EXTRF` and otherwise starts the sketch. It
  then gives the host 1 s, set by its watchdog with `WATCHDOG_1S` (source:
  [optiboot.c](https://github.com/arduino/ArduinoCore-avr/blob/master/bootloaders/optiboot/optiboot.c)).
- **A wrong speed ends the bootloader.** If a command does not end in `CRC_EOP`, Optiboot's `verifySpace` sets a
  16 ms watchdog and starts the sketch. ATmegaBOOT starts the sketch after `MAX_ERROR_COUNT` (5) bad bytes (source:
  optiboot.c,
  [ATmegaBOOT_168.c](https://github.com/arduino/ArduinoCore-avr/blob/master/bootloaders/atmega/ATmegaBOOT_168.c)).
  Inference: so a page that tries the wrong speed must reset the board again before it tries the next speed.
- **Writing.** Both bootloaders take word addresses in `LOAD_ADDRESS` and double them. Optiboot erases each page
  inside `PROG_PAGE`, which is why avrdude runs with `-D` (no chip erase). Optiboot always writes a whole
  `SPM_PAGESIZE` page from its buffer (source: optiboot.c). Inference: the last page must be padded with 0xFF.

### What Web Serial gives

- `port.open({ baudRate })` sets the speed. Changing it means `close()` and `open()` again: the spec has no other
  method that sets the speed (docs: [Web Serial spec](https://serial.spec.whatwg.org/), `SerialOptions`).
- `port.setSignals({ dataTerminalReady, requestToSend })` asserts or deasserts DTR and RTS. The spec's own example
  toggles DTR to put "some micro-controllers" into programming mode (docs: Web Serial spec, `setSignals()`).
- **Opening a port can reset a Nano.** Chromium on Windows opens the port with `fDtrControl = DTR_CONTROL_ENABLE`
  (source: [serial_io_handler_win.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/services/device/serial/serial_io_handler_win.cc)).
  The POSIX handler sets no DTR state on open (source: serial_io_handler_posix.cc), so Linux and macOS use the OS
  default. Inference: that default raises DTR, as the site's own `monitor()` comment observes on the ESP-01S
  adapter. So each `open()` restarts a Nano, including each reopen at the sketch's speed.
- Browsers: Chrome 89+ and Edge (mirroring Chrome) on desktop, and Firefox 151+ on desktop; not Safari (docs:
  [browser-compat-data `api/Serial.json`](https://github.com/mdn/browser-compat-data/blob/main/api/Serial.json)).

### The libraries

| Library | Last release | Licence | Runs in a browser without Node polyfills | Size, minified / gzipped | Reset and old bootloader |
| --- | --- | --- | --- | --- | --- |
| [avrgirl-arduino](https://github.com/noopkat/avrgirl-arduino) | 5.0.1, 2021-02-07 | MIT | No: the README calls Web Serial an "alpha release". The build uses webpack with `stream-browserify`, `os-browserify`, `process` and a git-pinned `browser-serialport` (source: package.json, README). | 202,251 / 55,801 B, its own prebuilt `dist/avrgirl-arduino.min.js` (run) | Cycles DTR (`_cycleDTR`, source). Its board list includes the Nano. |
| [avrbro](https://github.com/kaelhem/avrbro) | 0.0.8, 2024-08-30 | MIT | Yes: it imports the `buffer` package itself. esbuild bundled it for the browser with no extra config (run). | 41,530 / 12,392 B (run, esbuild 0.25) | Sends DTR and RTS high for 250 ms, then low. Has two presets, `nano` (57600) and `nano (new bootloader)` (115200), with no detection (source). |
| [web-arduino-uploader](https://github.com/dbuezas/arduino-web-uploader) | npm 1.0.0, 2020-10-25; repo at 1.1.2, last commit 2023-07-20 | package.json says MIT; GitHub detects no licence file | No: esbuild stops at `Could not resolve "stream"` from `readable-web-to-node-stream` (run). npm's `main` names `dist/index.ts`, which the package lacks (run). | Not bundled (run) | No explicit DTR toggle; it relies on opening the port (source). Has a `nanoOldBootloader` preset at 57600 (source). |
| [stk500](https://github.com/jacobrosenthal/js-stk500v1) | 2.0.3, 2020-11-22 | MIT | No: it uses the global `Buffer` and Node streams' `on('data')` and `write(cb)` (source). | 18,117 / 5,748 B bundled, which still needs `Buffer` and a stream adapter at runtime (run, source) | None: the caller resets the board. |
| [@duinoapp/upload-multitool](https://github.com/duinoapp/upload-multitool) | 0.0.3, 2024-03-23 | MIT | The README says it is "browser friendly", with a `WebSerialPort` "drop-in web replacement for serialport" (docs). It depends on `serialport`, `axios`, `crypto-js` and `pako` (run: `npm view`). | Not measured | Not read |
| Spike, `research/arduino-nano-spike/` | none | this repo | Yes (run) | 3,626 / 1,756 B (run, esbuild 0.25) | avrdude's pulse; tries 115200 then 57600 |

**Defects found in avrbro 0.0.8's source:**

- `verifySignature` and `verifyPage` read the board's reply but never compare it, so neither the signature nor the
  written flash is checked.
- `sendCommand` does not await `writer.write`.
- `receiveData` cuts the chunk with `data.slice(index, data.length - index)`, which drops trailing bytes when the
  reply does not start the chunk.
- A timeout sets a flag, but the pending `reader.read()` keeps waiting, so a silent board hangs the flash.
- `reset` does not await `setSignals`.

**Other projects.**

- Arduino Cloud uploads through the Arduino Cloud Agent, a native program the visitor installs (docs:
  [Cloud Agent](https://docs.arduino.cc/arduino-cloud/hardware/cloud-agent), seen as a search excerpt because the page
  did not render for the fetcher).
- Wokwi simulates boards and loads firmware into the simulator. No evidence was found that it flashes hardware (docs:
  search results only, **not verified**).
- [Shubin123/arduino-web](https://github.com/Shubin123/arduino-web) is an in-browser IDE that uploads over Web Serial.
  It is AGPL-3.0, was created on 2026-10-10 and has no stars (run: GitHub API). It is an application, not a library.
- Commit activity by repository, from the GitHub API (run): avrgirl-arduino's last commit is from 2021-02-07; stk500's
  from 2020-11-22. Both have open issues and no releases since.

## 2. What the flasher takes, and what the firmware task would add

- **Every library takes Intel HEX.** avrgirl-arduino, web-arduino-uploader and the duinoapp tool parse it with
  `intel-hex`; avrbro has its own parser (source). esptool-js 0.7.1, already a dependency of the site, exports
  `parseIntelHex`, which returns address segments (source: `lib/image/intelHex.d.ts`).
- **arduino-cli writes the hex already.** Compiling a test sketch for `arduino:avr:nano` with arduino:avr 1.8.8 wrote
  `nanoblink.ino.hex`, `.ino.eep`, `.ino.elf`, `.ino.with_bootloader.hex` and `.ino.with_bootloader.bin`. It wrote no
  bare `.ino.bin` (run). The upload recipe flashes `<sketch>.ino.hex` (run: `tools.avrdude.upload.pattern`).
- **One image serves both bootloaders.** The `cpu=atmega328` and `cpu=atmega328old` builds produced byte-identical
  `.ino.hex` files. Only `upload.speed` and the burnt bootloader differ (run: `cmp`, `--show-properties`). So a sketch
  needs one image, and the flasher picks the speed.
- **The spike's parser matches avr-objcopy.** It turned that hex into the same 1,998 bytes as
  `avr-objcopy -O binary -R .eeprom` from the ELF (run).
- **Changes to `.mise/tasks/arduino/firmware`.** It handles ESP cores only today (source):
  - Add `arduino:avr` to `PLATFORM_PREFIXES`, so that `esp_profiles` (to be renamed) selects AVR profiles.
  - Read `tools.avrdude.upload.pattern` beside the two ESP recipes in `UPLOAD_RECIPES`. Take the chip from
    `-p<mcu>` (`atmega328p` → `ATmega328P` in `CHIP_FAMILIES`) and the file from `-Uflash:w:<file>:i`, in place of
    `--chip` and the `write_flash` pairs.
  - Replace the check that the recipe writes `<sketch>.ino.bin` with an AVR branch, and publish one part at offset 0.
    That part is either the `.hex`, parsed in the page (5,647 B for the test sketch), or a flat `.bin` the task
    derives from it (1,998 B), which keeps every manifest part a binary at an offset. Both work. The `.bin` keeps the
    site's `load()`/`write()` path uniform.
  - Leave the old-bootloader speed out of the manifest: the image is the same.
- **A new core.** The Tank sketch's `sketch.yaml` would pin `arduino:avr`, which `AGENTS.md`'s stack line does not
  name yet. That line changes with the sketch.

## 3. Board and browser conditions

- **Chrome or Edge on a computer.** Web Serial covers it (docs). Each open resets the Nano (section 1), so reading
  the sketch after a flash restarts it once. That is the same behaviour as the Arduino IDE's serial monitor
  (inference).
- **Android, CH340 clone.**
  - Web Serial on Android 17 exposes only ports that have a kernel driver. Android's generic kernel builds none for
    CH341 ([#23](https://github.com/lmarqs/robomania/issues/23), `research/phone-flashing.md` on branch
    `research/phone-flashing`).
  - The WebUSB route works through esptool-js 0.7.1's `WebUSBSerialPort` (CH340/CH341, VID 0x1a86). Its `open()`
    releases DTR and RTS rather than asserting them, so the explicit pulse is what resets the board. Its
    `setSignals` writes CH340 request 0xA4 with DTR at bit 5 and RTS at bit 6, active low (source:
    `esptool-js/lib/webusb.js`).
  - The spike's `SerialPortLike` accepts both Web Serial's `SerialPort` and `WebUSBSerialPort` (run: `tsc` against
    `@types/w3c-web-serial` 1.0.9, `@types/w3c-web-usb` and esptool-js 0.7.1's types). So the same STK500 code runs on
    either port.
- **Android, genuine Nano (FT232RL).** Web Serial on Android 17 with Chrome 148, where the phone maker enabled the
  serial service. The generic kernel builds `CONFIG_USB_SERIAL_FTDI_SIO` (#23). esptool-js has no WebUSB driver for
  FTDI.
- **iOS, iPadOS, Firefox for Android.** Impossible (#23).
- **Telling the bootloaders apart.** Both bootloaders answer `READ_SIGN` with the chip's signature, 0x1E 0x95 0x0F
  (source: optiboot.c answers `SIGNATURE_0..2`; avrbro's and web-arduino-uploader's presets use the same bytes for
  both). Both report a software version to `GET_PARAMETER` 0x81/0x82 (source: optiboot.c, ATmegaBOOT_168.c). Either
  answer comes only from a bootloader already reached at its own speed. So the speed that answers is what tells them
  apart:
  - Speeds tried: 115200, then 57600, each after its own open and reset.
  - In the spike's simulation, an Optiboot board answered in about 0.45 s. An old-bootloader board took about 2.7 s,
    because it first spends four sync attempts at 115200 (run, simulated).
  - Inference: remembering the speed that answered, per port, saves that time on later flashes.
- **Pins 0 and 1.** The ATmega328P's only hardware UART is on D0/D1, which the USB chip also drives. An HC-05 wired
  to D0/D1 shares the bootloader's lines and can block the flash. Inference, **not verified**: the Tank sketch should
  put the HC-05 on other pins with `SoftwareSerial`, or the page should ask the visitor to unplug it before flashing.

## 4. What the site would change

Inference from the code as it is on `main` at `fd53309`, nothing built:

- **`site/src/lib/flash/stk500Flasher.ts`** (new): a `Stk500Flasher implements Flasher` built on the spike's
  `stk500.ts`.
  - `connect` reaches the bootloader and resolves with `ATmega328P` once the signature matches.
  - `load` and `write` take the one part at offset 0.
  - `reset` is a DTR pulse, though the bootloader's own `LEAVE_PROGMODE` already restarts the board.
  - `monitor` reopens at the sketch's speed, which restarts the sketch.
  - `restart` pulses DTR, where `EsptoolFlasher` pulses RTS.
  - `attach` cannot read a running Nano without restarting it over Web Serial, because opening resets it.
- **`site/src/lib/flash/flasher.ts`.**
  - The `Flasher` interface fits as written.
  - `EsptoolFlasher` and the new flasher both call `navigator.serial.requestPort()` themselves. One session holds one
    port (`site/src/lib/board/board.ts` builds it once with `createFlasher()`), so port ownership moves out of the ESP
    class into something both share. This is the same change #23 named for WebUSB.
- **`site/src/lib/flash/createFlasher.ts`.** It returns one flasher that delegates to esptool-js or STK500. The
  delegate follows the board the visitor picked in the dock. With no pick, it tries the ESP ROM and then STK500, or
  asks first.
  - Inference: the order matters. esptool-js's connect toggles DTR and RTS, which resets a Nano, and its bytes at the
    wrong speed make the Nano's bootloader start the sketch. The STK500 attempt then resets again, so trying the ESP
    first costs time, not correctness.
- **`site/src/lib/flash/manifest.ts`.**
  - Add `'ATmega328P'` to `ChipFamily`.
  - Change the comment that calls chip names "esptool-js's `CHIP_NAME`".
- **`site/src/lib/board/models.ts`.**
  - Add a `BOARD_MODELS` entry such as `{ id: 'nano', name: 'Arduino Nano', look: 'Long, narrow board with a Mini-USB
    socket', chip: 'ATmega328P' }`.
  - Add a field naming the protocol, so `createFlasher` can choose.
  - `restartConnection` and `modelAnswering` work unchanged: the chip names the board.
- **`site/src/lib/flash/wording.ts`.**
  - `NO_ANSWER` and `noAnswer()` tell the visitor to hold BOOT, which the Nano does not have. Its branch would say to
    unplug whatever sits on pins 0 and 1 and press Try again, or to press the board's reset button as Try again
    starts.
  - `USE_CHROME_OR_EDGE` holds for the Nano too.
- **`site/src/lib/flash/session.ts`.** `RESETLESS_CHIP` (`ESP8266`) and the flash-mode path do not apply to the Nano,
  which always restarts from DTR. A Nano sketch that speaks the `cfg` protocol works as today, once `monitor` has
  reopened at its speed.
- **`site/src/components/board/Dock.astro`.**
  - It lists `BOARD_MODELS`, so the Nano appears once the model exists.
  - The dock keeps the port open across pages with `transition:persist`, so moving between pages does not reset the
    Nano.
  - A flash from a page that holds the port (`connect({ reusePort: true })`) closes the monitor's reader, reopens at
    115200 or 57600, and pulses DTR. Each speed change is a close and reopen, because Web Serial has no other way.
- **Tests.**
  - `site/tests` unit tests for the STK500 module against a simulated bootloader, as `simulate.ts` does.
  - The e2e fake flasher (`window.__robomaniaFakeFlasher`) stays as it is.

## 5. The spike

`research/arduino-nano-spike/` holds the spike. It is outside `site/` and wired to nothing:

- `stk500.ts`: the flasher.
  - Its `SerialPortLike` port interface takes a Web Serial port or esptool-js's `WebUSBSerialPort`.
  - Uses avrdude's reset pulse.
  - Syncs with retries, each after a reset.
  - Tries 115200, then 57600.
  - Checks the signature.
  - Writes pages padded with 0xFF.
  - Reads every page back and compares it.
  - Ends with `LEAVE_PROGMODE`.
- `intelHex.ts`: a hex-to-bytes parser with checksum checks.
- `simulate.ts`: a fake port that answers as Optiboot (at 115200) or ATmegaBOOT (at 57600) do in their source.
  - It stays in the bootloader only after a DTR assert.
  - It leaves for the sketch on a wrong speed or a missing `CRC_EOP`.

Results, all run here, none on a board:

- `node research/arduino-nano-spike/simulate.ts <sketch>.ino.hex` (Node 24.19, type stripping) with the arduino-cli
  build of a blink sketch for `arduino:avr:nano`:

  ```text
  image: 1998 bytes, 16 pages
  bootloader at 115200: reached at 115200, progress ended at 100%, flash matches the image, 447 ms
  bootloader at 57600: reached at 57600, progress ended at 100%, flash matches the image, 2657 ms
  bootloader at 19200: NoAnswerError: no bootloader answered at 115200 or 57600 baud
  ```

- `tsc` 5.8.3 with `strict`, `noUncheckedIndexedAccess` and `erasableSyntaxOnly`: no errors.
- esbuild 0.25 bundles `stk500.ts` and `intelHex.ts` for the browser to 3,626 B minified, 1,756 B gzipped.

The simulation checks the protocol logic against one reading of the bootloaders' source. It says nothing about timing
on real USB chips.

## Not verified

- Any flash of a real Nano, from any browser. No board was attached.
- That Chromium on Linux and macOS raises DTR on `open()` (OS default, inferred). That one `open()` therefore resets
  a Nano.
- That a DTR pulse as short as two back-to-back `setSignals` calls resets the board through the 100 nF capacitor on
  every USB chip, CH340 included. avrdude uses 100 µs. Web Serial cannot time a pulse that short.
- The Nano's DTR-to-RESET circuit from the schematic itself. Only secondary pages were read.
- When Arduino moved its own Nanos to Optiboot, and which bootloader the Tank's clone carries.
- That esptool-js's `WebUSBSerialPort` resets and flashes a CH340 Nano on Android. It was only type-checked.
- @duinoapp/upload-multitool's code, bundle size and Web Serial behaviour. Only its README and npm metadata were read.
- Wokwi: only search results were read.
- That an HC-05 on D0/D1 blocks the flash.
- The time an old-bootloader board takes to answer on hardware. 2.7 s is the simulation's figure.

## Sources

- ArduinoCore-avr: [boards.txt](https://github.com/arduino/ArduinoCore-avr/blob/master/boards.txt),
  [optiboot.c](https://github.com/arduino/ArduinoCore-avr/blob/master/bootloaders/optiboot/optiboot.c),
  [ATmegaBOOT_168.c](https://github.com/arduino/ArduinoCore-avr/blob/master/bootloaders/atmega/ATmegaBOOT_168.c),
  [atmega/Makefile](https://github.com/arduino/ArduinoCore-avr/blob/master/bootloaders/atmega/Makefile), commit
  [1b14cc0733](https://github.com/arduino/ArduinoCore-avr/commit/1b14cc0733).
- avrdude: [src/arduino.c at v8.0](https://github.com/avrdudes/avrdude/blob/v8.0/src/arduino.c),
  [src/stk500.c](https://github.com/avrdudes/avrdude/blob/main/src/stk500.c).
- Web Serial: [spec](https://serial.spec.whatwg.org/),
  [browser-compat-data `api/Serial.json`](https://github.com/mdn/browser-compat-data/blob/main/api/Serial.json),
  Chromium [serial_io_handler_win.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/services/device/serial/serial_io_handler_win.cc)
  and [serial_io_handler_posix.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/services/device/serial/serial_io_handler_posix.cc).
- Libraries: [avrgirl-arduino](https://github.com/noopkat/avrgirl-arduino), [avrbro](https://github.com/kaelhem/avrbro),
  [web-arduino-uploader](https://github.com/dbuezas/arduino-web-uploader),
  [js-stk500v1](https://github.com/jacobrosenthal/js-stk500v1),
  [upload-multitool](https://github.com/duinoapp/upload-multitool), esptool-js 0.7.1 as installed in `site/`
  (`lib/webusb.js`, `lib/image/intelHex.d.ts`).
- Arduino Cloud: [Cloud Agent](https://docs.arduino.cc/arduino-cloud/hardware/cloud-agent).
- Android: [#23](https://github.com/lmarqs/robomania/issues/23) and its `research/phone-flashing.md`.
