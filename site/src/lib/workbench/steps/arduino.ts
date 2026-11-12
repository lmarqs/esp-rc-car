/** What the sketches' Arduino calls do to text, for the step programs that mirror them. */

/** Arduino `String::trim()`: strips the C locale's white space from both ends. */
export const trim = (text: string): string => text.replace(/^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g, '');

/** Arduino `isDigit()` on one character; `undefined` stands for reading past the end of a `String`, which gives 0. */
export const isDigit = (char: string | undefined): boolean => char !== undefined && char >= '0' && char <= '9';

/** `line.toInt()` for a line that starts with a digit: the digits at its start, as `atol` reads them. */
export const toInt = (text: string): number => Number.parseInt(text, 10);
