# esp-rc-car

Firmware for an ESP32 RC car: drivers in `lib/` and sketches in `sketches/`. The [README](README.md) says what is
built so far and how to build and flash it.

Stack: C++ on the Arduino `esp32-bluepad32:esp32` 4.1.0 core (each sketch's `sketch.yaml`); arduino-cli 1.6.0,
Python 3.12, uv 0.11.25, clang-format 23.1.5 and the-cook 11.0.2 (`mise.toml`); pyserial 3.5 (`pyproject.toml`).

## Quick reference

- Install or add a dependency: `mise install && mise run setup`, [Build a sketch](README.md#build-a-sketch) says
  why; a Python package: `uv add <package>` (unverified); a core or Arduino library: add it to the sketch's
  `sketch.yaml` profile (unverified)
- Run: `mise run arduino:run <sketch> --port <port>` (unverified)
- Build: `mise run arduino:compile <sketch>`, such as `sketches/blink`
- Test one file: none
- Lint or format one file: `mise exec -- clang-format -i <file>`
- Generate code: `mise run arduino:hexdump <sketch>`, which turns each file in `<sketch>/data` into a C header
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
- A procedure an agent repeats: a skill in `.agents/skills/`.
- A trap in one area: `.agents/memory/`, listed under Deep dive.

## Rules

- A behavior change ships with a test; a bug fix with one that failed before the fix.
- Comments record only reasons the code cannot show.
- Change only what the task needs, matching the surrounding code.
- Format with `.clang-format`. Wrap a file that builds only on ESP32 in `#ifdef ESP32`, as `lib/esp_ledc_pin.h`
  does.
- Commits: one change per commit, pushed straight to `main`; no pull requests
- Deploy: none

## Gotchas

At most five traps any task can hit.

- `arduino:upload`, `arduino:monitor` and `arduino:run` run `sudo chmod` on the port, so they wait for a password.
- A header named like a system header shadows it: `lib/camera.h` is not `esp_camera.h` for that reason.

## Deep dive (read on demand)

- The agents layout, permissions and harness setup: `.agents/README.md` and the `agents-layout` skill.
<!-- cook:begin io.github.lmarqs.cookbook:git#worktrees/worktrees -->
<!-- io.github.lmarqs.cookbook:git#worktrees --instructions=AGENTS.md --instructions=README.md -->
- Worktrees: branch `<branch>` is checked out at `.worktrees/<branch>`; `.worktrees/README.md` says how to
  create one ready to run and remove it.
<!-- cook:end io.github.lmarqs.cookbook:git#worktrees/worktrees -->
