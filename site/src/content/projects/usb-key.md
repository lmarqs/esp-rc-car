---
title: USB password key
summary: A tiny ATtiny85 board that plugs into USB and types like a keyboard.
art: key
level: beginner
state: draft
order: 4
sketch: sketches/usb-key
topics: [tooling]
---

## What it does

Plug the key into a computer and it types one password, then Enter. It suits a long password you are tired of
typing, or a machine with no keyboard at hand.

- The password is typed once, about a second after the computer recognizes the key. Unplug it and plug it again to
  type it again.
- The onboard LED then blinks one second on and one off, which shows the typing is over.

Whoever holds the key holds the password: it sits in the board's memory in the clear, and the key types it into
whatever window has the focus. Build it to learn how USB keyboards work, and use it only for a password whose loss
you accept.

## The parts

One board: a **Digispark**, a thumb-sized board around an ATtiny85 microcontroller, with a USB plug cut into its
own circuit board. It has 8 KB of flash, of which the sketch gets about 6.6 KB, and 512 bytes of RAM. The sketch uses 2.8 KB.

## How a microcontroller pretends to be a keyboard

The ATtiny85 has no USB hardware. The Digispark's `DigiKeyboard` library does USB in software: it toggles two pins
fast enough to speak low-speed USB, and tells the computer it is a HID device, the class keyboards and mice belong
to. The computer needs no driver and cannot tell it from a keyboard. From then on, each character the sketch
"prints" arrives as a key press.

## Run it on your board

Put the password in `sketches/usb-key/local.h`, a file Git ignores so the password stays out of the repository:

```cpp
#define USB_KEY_PASSWORD "correct horse battery staple"
```

With the tools installed (the [tooling page](../../learn/tooling/) says how), run from the repository's root, with
the key unplugged:

```sh
mise run arduino:run sketches/usb-key
```

The Digispark has no serial port, so the command takes no `--port`. It uploads through the board's own USB
bootloader: plug the key in when the upload asks for it.

The sketch compiles; uploading has not been tried from this repository yet. If a step fails, the repository wants
to hear about it.

## How the code works

```cpp
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  DigiKeyboard.sendKeyStroke(0);
  DigiKeyboard.delay(1000);
  DigiKeyboard.println(USB_KEY_PASSWORD);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  delay(1000);
}
```

`setup()` runs once, when the key gets power. `sendKeyStroke(0)` presses no key at all: some computers drop the
first key after a keyboard appears, so an empty one goes first. `DigiKeyboard.delay(1000)` waits a second while
still answering the computer's USB polls, which a plain `delay()` would miss. `println` types the password and
Enter. `loop()` only blinks the LED.

## Not handled

- The key types on a US keyboard layout. A computer set to another layout receives other characters for some
  symbols; use a password whose characters sit on the same keys in both layouts.
- The password is typed blind. If another window has the focus, the password lands there.
