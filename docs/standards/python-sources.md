---
description: Sets how Python scripts in the repository are run, found by the linter and documented.
audience: Whoever writes or reviews a Python script here: a mise task, an editor helper or a sketch's bench tool; knows Python
---
# Python sources

Every Python file in the repository follows the rules below: the mise tasks written in Python, `.vscode/*.py`, and
a sketch's `tools/`. ruff sets the layout and the lint rules, from `pyproject.toml`, and the Done check in
[AGENTS.md](../../AGENTS.md) enforces both.

- A script MUST run on the interpreter and packages that `mise.toml` and `pyproject.toml` pin: as a mise task, or
  with `mise exec -- python <script>`. A script that needs a new package gets it with `uv add <package>`. The
  system's Python has neither pyserial nor the same version, so a script run on it fails or behaves differently.
- A mise task written in Python has no `.py` extension, since its file name is the task's name, and MUST be listed
  under `extend-include` in `pyproject.toml`. ruff finds Python files by extension, so a task left out is neither
  formatted nor linted.
- A script MUST open with a docstring that says what it is for and, when it is run by hand, shows a command that
  runs it from the repository's root. A bench tool is run rarely, and its file is the only place its user looks.
- A comment SHOULD record only a reason the code cannot show, as in [C++ sources](cpp-sources.md).
