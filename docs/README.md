---
description: Maps the kinds of page in docs/, when a fact belongs to each, and what a good page of each achieves.
audience: Whoever writes down a fact about the esp-rc-car firmware, or looks for one
---
# Docs

`docs/` holds what the code and its history show nowhere else about the esp-rc-car firmware. Building and flashing
a sketch is in the [README](../README.md); what agents run and must not do is in [AGENTS.md](../AGENTS.md).

## Kinds

**[Architecture](architecture.md)**: the parts of the firmware, what each is for, and which way they depend on each
other. A fact belongs here when no single file shows it. A good page names each part with its directory and shows
the dependencies; it names no class, function or constant, since those are implementation and the code holds them.

**[Sketches](sketches/README.md)**: what each sketch does for whoever runs it, one page per sketch, named after its
directory. A fact belongs here when it states what the sketch owes its user and reading the code would not tell them:
a pin, a threshold, a timeout. A good page opens with what the sketch is for and why, follows its inputs, signals
and outputs, and names what it does not handle, each with its workaround.

**[Standards](standards/README.md)**: practices every file of one sort follows where no check enforces them, such as
how a `lib/` header is named. A fact belongs here when it constrains code someone writes, everywhere they write it.
A good page is named after the sort of file, gives each practice with its reason, and marks what must not vary with
MUST, SHOULD and MAY. A practice that a check comes to enforce leaves the page, and its reason moves beside the check.

## Where a fact goes

The kind is the question a reader brings to a fact, not the fact's subject. Take the omnidirectional robot's
motors: that sketches reach motors only through the drivers in `lib/` is architecture; that the robot stops when no
command has come for 500 ms belongs on its sketch's page; that the LEDC pin driving them is wrapped in
`#ifdef ESP32` follows a standard; how `CarPilot` turns a speed into a duty belongs in the code, on no page.

## Misfilings

- Implementation written into the architecture page. Giveaway: a class, function or constant name. It belongs in
  the code, or on the sketch's page when a user relies on it.
- One driver's behavior written as a standard. Giveaway: it names one class. It belongs in that header's doc
  comment.
- How to build or flash a sketch, written into a page. It belongs in the README, or in AGENTS.md when only agents
  need it.
- A practice that clang-format or the build already enforces. The check is its owner.

To write or review a page, run the `docs-layout` skill, such as `/docs-layout sketches servo` in Claude Code.
