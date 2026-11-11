---
description: Maps the kinds of page in docs/, when a fact belongs to each, and what a good page of each achieves.
audience: Whoever writes down a fact about the esp-rc-car firmware, or looks for one
---
# Docs

`docs/` holds what the code and its history show nowhere else about the esp-rc-car firmware. Building and flashing
a sketch is in the [README](../README.md); what agents run and must not do is in [AGENTS.md](../AGENTS.md).

## Kinds

**[Architecture](architecture.md)**: how the sketches, the drivers in `lib/` and the ESP32 core fit together: which
interface each driver takes its pins through, and which drivers build only for ESP32. A fact belongs here when no
single file shows it. A good page lets a reader go from a part's name to its directory and see what it depends on.

**[Standards](standards/README.md)**: practices every file of one sort follows where no check enforces them, such as
how a `lib/` header is named. A fact belongs here when it constrains code someone writes, everywhere they write it.
A good page is named after the sort of file, gives each practice with its reason, and marks what must not vary with
MUST, SHOULD and MAY. A practice that a check comes to enforce leaves the page, and its reason moves beside the check.

## Where a fact goes

The kind is the question a reader brings to a fact, not the fact's subject. Take the LEDC pin: that
`EspLedcOutPin` is the `PwmOutPin` every PWM driver runs on is architecture, since no one file shows the drivers and
the pin together; that `lib/ledc_pin.h` is wrapped in `#ifdef ESP32` follows a standard every ESP32-only file meets;
what `EspLedcOutPin::begin()` does belongs in the doc comment in its header, on no page.

## Misfilings

- One driver's behavior written as a standard. Giveaway: it names one class. It belongs in that header's doc
  comment.
- How to build or flash a sketch, written into a page. It belongs in the README, or in AGENTS.md when only agents
  need it.
- A practice that clang-format or the build already enforces. The check is its owner.
