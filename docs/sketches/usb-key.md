---
description: Explains what the usb-key sketch does: a Digispark ATtiny85 that types one password as a USB keyboard when plugged in.
audience: Whoever builds or carries the USB password key, or changes its sketch
keywords: Digispark, ATtiny85, DigiKeyboard, HID, Micronucleus, local.h
---
# USB key

The board that runs `sketches/usb-key` is a Digispark ATtiny85 that the computer sees as a USB keyboard. Plugged in,
it types one password and Enter, so a long password needs no typing and a device with no keyboard at hand can be
unlocked.

- The password is typed once, about a second after the computer recognizes the keyboard. Unplug the key and plug it
  again to type it again.
- The onboard LED then blinks one second on and one off, which shows the typing is over.
- The password is `USB_KEY_PASSWORD` in `sketches/usb-key/local.h`, a file Git ignores:
  `#define USB_KEY_PASSWORD "..."`. Without the file the key types `default_password`.

The Digispark has no serial port: it uploads through its Micronucleus USB bootloader. Run
`mise run arduino:run sketches/usb-key` with no `--port`, and plug the board in when the upload asks for it.

## Not handled

- The password is stored in the board's flash in the clear and is typed into whatever has the keyboard's focus.
  Whoever holds the key holds the password: use it only for a password whose loss you accept.
- The key types on a US keyboard layout. A computer set to another layout receives other characters for some
  symbols; use a password whose characters sit on the same keys in both layouts.
