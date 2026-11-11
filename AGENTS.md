# esp-rc-car

Firmware for an ESP32 RC car: drivers in `lib/` and sketches in `sketches/`. The [README](README.md) says what is
built so far and how to build and flash it.

Stack: C++ on the Arduino `esp32-bluepad32:esp32` 4 core, pinned in each sketch's `sketch.yaml`; arduino-cli 1,
Python 3.12, uv, clang-format and the-cook, pinned in `mise.toml`; pyserial 3, pinned in `pyproject.toml`.

## Quick reference

- Install or add a dependency: `mise install && mise run '*:setup'`, [Build a sketch](README.md#build-a-sketch) says
  why; a Python package: `uv add <package>` (unverified); a core or Arduino library: add it to the sketch's
  `sketch.yaml` profile (unverified)
- Run: `mise run arduino:run <sketch> --port <port>` (unverified)
- Flash a compiled sketch: `mise run arduino:upload <sketch> --port <port>`, with the port from
  `mise exec -- arduino-cli board list`
- Build: `mise run arduino:compile <sketch>`, such as `sketches/blink`
- Test one file: none
- Lint or format one file: `mise exec -- clang-format -i <file>`
- Generate code: `mise run arduino:hexdump <sketch>`, which turns each file in `<sketch>/data` into a C header;
  the Build command also writes `.build/compile_commands.json` for VS Code IntelliSense
- Local services: none
- Worktrees: `git worktree add .worktrees/<branch> -b <branch> && (cd .worktrees/<branch> && .worktrees/setup)`;
  remove with `(cd .worktrees/<branch> && .worktrees/teardown) && git worktree remove .worktrees/<branch>`
- Quick check, seconds on what changed: `mise exec -- clang-format --dry-run --Werror <file>` on each changed file,
  then the Build command for the sketch the change touches
- Done check, all that must pass before a change is done:
  `mise exec -- clang-format --dry-run --Werror lib/* sketches/*/*.ino`, then the Build command for every sketch in
  `sketches/`; under 10 seconds for one sketch once the core is installed; no services

## Boundaries

**Always**

- Run the Quick check before moving on. A change is done when the Done check passes.
- Report each check's result, or that it did not run.
- Update this file in the change that alters a command, path or rule it names.
- Keep this file under 800 words; past 1,200, move a section into a skill or memory file before adding. All
  `AGENTS.md` files together stay under 16 KiB.

**Never**

- Commit secrets or credentials, or put personal data in logs, fixtures or commits.
- Edit generated files by hand: `<sketch>/data/*.h`
- Make a check pass by weakening it: skipping a test, suppressing a warning, loosening an assertion.

**Stop and ask** before destroying state such as uncommitted work or secrets, and when a check fails again after a
fix, a command is refused, or a decision is left open.

Enforced by `.agents/permission/policy.yaml`. A refusal is the rule working.

## Where things go

- New code: drivers in `lib/`, sketches in `sketches/`, laid out as [Code layout](README.md#code-layout) says; no
  design document
- Tests: none
- Settings: `.env` (gitignored, loaded by mise), arduino-cli in `arduino-cli.yaml`, board profile in `sketch.yaml`;
  no secrets yet
- Decisions and domain rules: none
- A mise task: an executable file at `.mise/tasks/<namespace>/<task>`, run as `mise run <namespace>:<task>`.
- A procedure an agent repeats: a skill in `.agents/skills/`.
- A trap in one area: `.agents/memory/`, listed under Deep dive.

## Rules

- The repository has no tests yet: report how a behavior change was checked, by the Done check or a run on the
  board.
- Comments record only reasons the code cannot show.
- Sketches use no namespaces; a helper private to its file is `static`.
- Change only what the task needs, matching the surrounding code.
- Format with `.clang-format`. Wrap a file that builds only on ESP32 in `#ifdef ESP32`, as `lib/ledc_pin.h`
  does.
- Commits: one change per commit, pushed straight to `main`; no pull requests
- Deploy: none

## Gotchas

At most five traps any task can hit.

- Upload only to a port `arduino-cli board list` shows; with none listed, ask the developer to connect the board.
  Leave `arduino:monitor` to the developer: it streams until stopped.
- Name each `lib/` header apart from every core header: one named `esp_camera.h` would shadow `<esp_camera.h>`.

## Deep dive (read on demand)

- Changing what agents may run, or how Claude or Codex is wired: the `agents-layout` skill and `.agents/README.md`.
<!-- cook:begin io.github.lmarqs.cookbook:git#worktrees/worktrees -->
<!-- io.github.lmarqs.cookbook:git#worktrees --instructions=AGENTS.md --instructions=README.md -->
- Worktrees: branch `<branch>` is checked out at `.worktrees/<branch>`; `.worktrees/README.md` says how to
  create one ready to run and remove it.
<!-- cook:end io.github.lmarqs.cookbook:git#worktrees/worktrees -->
