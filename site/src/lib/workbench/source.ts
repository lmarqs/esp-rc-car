/**
 * The path, relative to the repository, of the `.ino` a sketch folder holds: `sketches/blink/simple` has
 * `sketches/blink/simple/simple.ino`.
 */
export function sketchSourcePath(sketch: string): string {
  const folder = sketch.replace(/\/+$/, '');
  const name = folder.slice(folder.lastIndexOf('/') + 1);
  return `${folder}/${name}.ino`;
}

function toLines(text: string): string[] {
  return text.replace(/\r?\n$/, '').split(/\r?\n/);
}

/**
 * The 1-based line numbers of `current` that `previous` does not have, by a longest-common-subsequence line diff: a
 * line is kept when it belongs to the longest run of lines both files share in the same order, and every other line
 * of `current` is new. A changed line is new; a line moved against the order of the others is new. With no
 * `previous`, as for a project's first step, nothing is new.
 */
export function newLines(previous: string | undefined, current: string): number[] {
  if (previous === undefined) return [];
  const before = toLines(previous);
  const after = toLines(current);

  // lengths[i][j] is the length of the longest common subsequence of before[i..] and after[j..].
  const lengths = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      lengths[i][j] =
        before[i] === after[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const added: number[] = [];
  let i = 0;
  let j = 0;
  while (j < after.length) {
    if (i < before.length && before[i] === after[j]) {
      i++;
      j++;
    } else if (i < before.length && lengths[i + 1][j] >= lengths[i][j + 1]) {
      i++;
    } else {
      added.push(j + 1);
      j++;
    }
  }
  return added;
}

/**
 * The 1-based number of the `occurrence`-th line of `source` whose trimmed text is `text`, counting occurrences from 1
 * at the top; `undefined` when the file has no such line. This is how an operation's named line finds its place in
 * the file the page shows.
 */
export function lineNumber(source: string, text: string, occurrence = 1): number | undefined {
  let seen = 0;
  const lines = toLines(source);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === text && ++seen === occurrence) return i + 1;
  }
  return undefined;
}
