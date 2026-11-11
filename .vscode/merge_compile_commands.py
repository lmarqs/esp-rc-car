"""Merges arduino-cli compile databases into one that VS Code IntelliSense reads.

Usage: merge_compile_commands.py <output> <.build/<sketch>/compile_commands.json>...

arduino-cli compiles a generated `<build>/sketch/<name>.ino.cpp`, never the `.ino` itself, so each such entry is
rewritten to point at the sketch's `.ino`, compiled as C++ with the `Arduino.h` include the generator prepends.
A source that several sketches compile, such as a `lib/` driver, keeps the first sketch's entry.
"""

import json
import sys
from pathlib import Path


def ino_entry(entry: dict, ino: Path) -> dict:
    generated = entry["file"]
    arguments = [str(ino) if argument == generated else argument for argument in entry["arguments"]]
    arguments[1:1] = ["-x", "c++", "-include", "Arduino.h"]
    return {**entry, "file": str(ino), "arguments": arguments}


def main(output: str, databases: list[str]) -> None:
    merged = {}
    for database in map(Path, databases):
        build = database.resolve().parent
        sketch = Path.cwd() / database.parent.relative_to(".build")
        for entry in json.loads(database.read_text()):
            source = Path(entry["file"])
            if source.parent == build / "sketch" and source.name.endswith(".ino.cpp"):
                entry = ino_entry(entry, sketch / source.name.removesuffix(".cpp"))
            merged.setdefault(entry["file"], entry)
    Path(output).write_text(json.dumps(list(merged.values()), indent=2) + "\n")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
