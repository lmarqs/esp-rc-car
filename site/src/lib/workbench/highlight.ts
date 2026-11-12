/** What a piece of a source line is, for its colour in the editor; plain text has none. */
export type TokenKind = 'keyword' | 'string' | 'function' | 'number' | 'comment';

/** A run of one source line's text, with its kind when it is coloured. */
export interface Token {
  readonly text: string;
  readonly kind?: TokenKind;
}

const KEYWORDS = new Set([
  'bool',
  'break',
  'case',
  'char',
  'const',
  'continue',
  'default',
  'do',
  'double',
  'else',
  'false',
  'float',
  'for',
  'if',
  'int',
  'long',
  'return',
  'static',
  'String',
  'switch',
  'true',
  'uint8_t',
  'unsigned',
  'void',
  'while',
]);

/** Names that read as values: the pin levels. */
const CONSTANTS = new Set(['HIGH', 'LOW']);

// A comment, a string or character literal, a name, or a number, in that order of precedence.
const PIECE = /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([A-Za-z_]\w*)|(\d+(?:\.\d+)?)/g;

function kindOfName(line: string, name: string, end: number): TokenKind | undefined {
  if (KEYWORDS.has(name)) return 'keyword';
  if (CONSTANTS.has(name)) return 'number';
  if (/^\s*\(/.test(line.slice(end))) return 'function';
  return undefined;
}

function push(tokens: Token[], text: string, kind?: TokenKind) {
  if (text === '') return;
  const last = tokens[tokens.length - 1];
  if (last !== undefined && last.kind === undefined && kind === undefined) {
    tokens[tokens.length - 1] = { text: last.text + text };
  } else {
    tokens.push(kind === undefined ? { text } : { text, kind });
  }
}

/**
 * One line of an Arduino sketch split into runs to colour: keywords and types, string and character literals,
 * the names of called functions, numbers and `HIGH`/`LOW`, and `//` comments. A preprocessor line such as
 * `#include <Arduino.h>` is its directive as a keyword and the rest as a string. Joining the runs' text gives the line.
 */
export function highlightLine(line: string): Token[] {
  const tokens: Token[] = [];
  const directive = /^(\s*)(#\s*\w+)(\s*)(.*)$/.exec(line);
  if (directive) {
    const [, indent, name, gap, rest] = directive;
    push(tokens, indent);
    push(tokens, name, 'keyword');
    push(tokens, gap);
    push(tokens, rest, 'string');
    return tokens;
  }
  let at = 0;
  for (const match of line.matchAll(PIECE)) {
    const start = match.index;
    const [text, comment, literal, name] = match;
    push(tokens, line.slice(at, start));
    if (comment !== undefined) push(tokens, text, 'comment');
    else if (literal !== undefined) push(tokens, text, 'string');
    else if (name !== undefined) push(tokens, text, kindOfName(line, name, start + text.length));
    else push(tokens, text, 'number');
    at = start + text.length;
  }
  push(tokens, line.slice(at));
  return tokens;
}
