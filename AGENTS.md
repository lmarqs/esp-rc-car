# esp-rc-car

Firmware for an ESP32 RC car: drivers in `lib/` and sketches in `sketches/`, and Robomania, the project's website,
in `site/`. The [README](README.md) says what is built and how to build and flash it.

Stack: C++ on the Arduino cores `esp32-bluepad32:esp32` 4, `esp8266:esp8266` 3 and `digistump:avr` 1, pinned in
each sketch's `sketch.yaml`; arduino-cli 1,
Python 3.12, uv, clang-format, ruff and the-cook, pinned in `mise.toml`; pyserial 3, pinned in `pyproject.toml`. The
website: Astro 7 on Node 24 and pnpm 12, pinned in `mise.toml` and `site/package.json`.

## Quick reference

- Install or add a dependency: `mise install && mise run '*:setup'`, [Build a sketch](README.md#build-a-sketch) says
  why; a Python package: `uv add <package>` (unverified); a core or Arduino library: add to the sketch's
  `sketch.yaml` profile (unverified); a website package: `pnpm --filter @robomania/site add <package>`
- Run: `mise run arduino:run <sketch> --port <port>` (unverified)
- Flash a compiled sketch: `mise run arduino:upload <sketch> --port <port>`, with the port from
  `mise exec -- arduino-cli board list`
- Build: `mise run arduino:compile <sketch>`, such as `sketches/blink`; the website: `mise run site:build`, and
  `mise run site:dev` to serve it locally
- Test: `mise run lib:test`; the website: `mise run site:test`
- Lint or format one file: `mise exec -- clang-format -i <file>`; Python: `mise exec -- ruff format <file>`
- Generate: `mise run arduino:hexdump <sketch>`, a C header per `<sketch>/data` file; website images:
  `mise run arduino:firmware`
- Worktrees: `git worktree add .worktrees/<branch> -b <branch> && (cd .worktrees/<branch> && .worktrees/setup)`;
  remove with `(cd .worktrees/<branch> && .worktrees/teardown) && git worktree remove .worktrees/<branch>`
- Quick check: `mise exec -- clang-format --dry-run --Werror <file>` on each changed file,
  then the Build command for the sketch the change touches, or `mise run site:build` for a `site/` change
- Done check:
  `mise exec -- clang-format --dry-run --Werror lib/* test/* sketches/*/*.ino`, then
  `mise exec -- ruff check . .vscode/*.py && mise exec -- ruff format --check . .vscode/*.py`, `mise run lib:test`,
  the Build command for every sketch in `sketches/`, `mise run site:build`, `mise run site:test`

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
  design document; website pages in `site/src/content/projects/` and `site/src/content/topics/`, one Markdown file
  each, and its playable examples in `site/src/components/examples/`
- Tests: `test/test_<header>.cpp`, only for `lib/` drivers needing no hardware
- Settings: `.env` (gitignored, loaded by mise), arduino-cli in `arduino-cli.yaml`, board profiles in `sketch.yaml`;
  a sketch's secrets in its gitignored `local.h`
- How the parts fit and coding standards: `docs/`, by the map in `docs/README.md`; write and review pages with the
  `docs-layout` skill
- A mise task: an executable `.mise/tasks/<namespace>/<task>`, run as `mise run <namespace>:<task>`.
- Firmware images: gitignored `site/public/firmware/`.
- A procedure an agent repeats: a skill in `.agents/skills/`.
- A trap in one area: `.agents/memory/`, listed under Deep dive.

## Rules

- Sketches have no tests: report how a behavior change was checked, by the Done check or a run on the board.
- Write C++ and Python by [the standards](docs/standards/README.md).
- Change only what the task needs, matching the surrounding code.
- Format with `.clang-format`.
- Commits: one change each, pushed straight to `main`; no pull requests
- Deploy: a push to `main` releases the website on a `#site-release` commit message, and the `lib/` library on
  `#lib-release` after raising `version` in `lib/library.properties`

## Gotchas

- Upload only to a port `arduino-cli board list` shows; with none listed, ask the developer to connect the board.
  Leave `arduino:monitor` to the developer: it streams until stopped.

## Deep dive (read on demand)

- How the sketches, `lib/` and the core fit together: `docs/architecture.md`.
- Changing what agents may run, or how Claude or Codex is wired: the `agents-layout` skill and `.agents/README.md`.
<!-- cook:begin io.github.lmarqs.cookbook:git#worktrees/worktrees -->
<!-- io.github.lmarqs.cookbook:git#worktrees --instructions=AGENTS.md --instructions=README.md -->
- Worktrees: branch `<branch>` is checked out at `.worktrees/<branch>`; `.worktrees/README.md` says how to
  create one ready to run and remove it.
<!-- cook:end io.github.lmarqs.cookbook:git#worktrees/worktrees -->
