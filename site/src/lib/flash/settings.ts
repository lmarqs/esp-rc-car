import type { Manifest, SettingField } from './manifest';

/** What the form holds, by key: each value as text, as the visitor typed it. */
export type SettingValues = Readonly<Record<string, string>>;

/** What to show beside each field that is wrong, by key. */
export type FieldErrors = Readonly<Record<string, string>>;

/** A line the board answers the settings protocol with. */
export type CfgReply =
  | { kind: 'ok'; key: string }
  | { kind: 'err'; key: string; reason: string }
  | { kind: 'value'; key: string; value: string }
  | { kind: 'end' };

/**
 * The fields the card asks for before it flashes `sketch`. The board answers its settings on the port the session reads
 * at the sketch's baud, so a sketch that prints nothing has none.
 */
export function settingsOf(manifest: Manifest, sketch: string, baud: number | undefined): readonly SettingField[] {
  return baud === undefined ? [] : (manifest.sketches[sketch]?.settings ?? []);
}

export function defaultValues(fields: readonly SettingField[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.key, String(field.default)]));
}

/** The board counts a text's length in bytes. */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function lengthText({ minLength = 0, maxLength = Infinity }: SettingField): string {
  if (maxLength === Infinity) return `Use at least ${minLength} characters.`;
  if (minLength === 0) return `Use at most ${maxLength} characters.`;
  return `Use ${minLength} to ${maxLength} characters.`;
}

function lengthError(field: SettingField, value: string): string | undefined {
  const length = byteLength(value);
  return length >= (field.minLength ?? 0) && length <= (field.maxLength ?? Infinity) ? undefined : lengthText(field);
}

function rangeText(field: SettingField): string {
  const { min = -Infinity, max = Infinity } = field;
  if (max === Infinity) return `Use a number of at least ${min}.`;
  if (min === -Infinity) return `Use a number of at most ${max}.`;
  return `Use a number from ${min} to ${max}.`;
}

function numberError(field: SettingField, value: string): string | undefined {
  const number = value.trim() === '' ? NaN : Number(value);
  if (!Number.isFinite(number)) {
    return 'Use a number.';
  }
  if (number < (field.min ?? -Infinity) || number > (field.max ?? Infinity)) {
    return rangeText(field);
  }
  return undefined;
}

function groupNumbers(fields: readonly SettingField[], group: string, values: SettingValues) {
  return fields.filter((field) => field.group === group).map((field) => ({ field, number: Number(values[field.key]) }));
}

/**
 * What is wrong with each value, in field order: a length, a number or a range the field's limits refuse, and a
 * group whose numbers, in field order, go down. A group's fault is on the first field lower than the one before it.
 */
export function validate(fields: readonly SettingField[], values: SettingValues): FieldErrors {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = values[field.key] ?? '';
    const error = field.type === 'number' ? numberError(field, value) : lengthError(field, value);
    if (error) {
      errors[field.key] = error;
    }
  }
  const groups = new Set(fields.flatMap((field) => (field.group ? [field.group] : [])));
  for (const group of groups) {
    const members = groupNumbers(fields, group, values);
    if (members.some(({ field }) => field.key in errors)) {
      continue;
    }
    const fault = members.findIndex((member, index) => index > 0 && member.number < members[index - 1]!.number);
    if (fault > 0) {
      errors[members[fault]!.field.key] = `Use at least the ${members[fault - 1]!.field.label}.`;
    }
  }
  return Object.fromEntries(fields.flatMap((field) => (field.key in errors ? [[field.key, errors[field.key]!]] : [])));
}

/** Reads a line of the settings protocol, or `undefined` for any other line. */
export function parseCfgLine(line: string): CfgReply | undefined {
  if (line === 'cfg end') {
    return { kind: 'end' };
  }
  const reply = /^cfg (ok|err) (\S+)(?: (.*))?$/.exec(line);
  if (reply) {
    return reply[1] === 'ok' ? { kind: 'ok', key: reply[2]! } : { kind: 'err', key: reply[2]!, reason: reply[3] ?? '' };
  }
  const value = /^cfg ([^\s=]+)=(.*)$/.exec(line);
  if (value) {
    return { kind: 'value', key: value[1]!, value: value[2]! };
  }
  return undefined;
}

function sameValue(field: SettingField, a: string, b: string | undefined): boolean {
  if (b === undefined) return false;
  return field.type === 'number' ? Number(a) === Number(b) : a === b;
}

/**
 * The values to send, by key, in field order. The board reports a password only as `set` or `unset`, so a password
 * is sent when it differs from the default; any other value, when it differs from what the board reported.
 */
export function changedValues(
  fields: readonly SettingField[],
  values: SettingValues,
  board: SettingValues,
): Record<string, string> {
  const changed: Record<string, string> = {};
  for (const field of fields) {
    const value = values[field.key] ?? String(field.default);
    const reference = field.type === 'password' ? String(field.default) : board[field.key];
    if (!sameValue(field, value, reference)) {
      changed[field.key] = value;
    }
  }
  return changed;
}

function groupOrdered(fields: readonly SettingField[], group: string, values: SettingValues): boolean {
  const numbers = groupNumbers(fields, group, values)
    .map(({ number }) => number)
    .filter(Number.isFinite);
  return numbers.every((number, index) => index === 0 || number >= numbers[index - 1]!);
}

/**
 * The order to send `pending` in, as key and value pairs. The board refuses a value that breaks its group's order
 * against the group's current values, so each turn takes the first pending field whose new value keeps its group
 * ordered against `board` and the values already sent. When none does, it takes the first pending one, which the
 * board then refuses.
 */
export function sendOrder(
  fields: readonly SettingField[],
  pending: SettingValues,
  board: SettingValues,
): [string, string][] {
  const current: Record<string, string> = { ...board };
  const rest = fields.filter((field) => field.key in pending);
  const order: [string, string][] = [];
  while (rest.length > 0) {
    const fits = rest.findIndex(
      (field) => !field.group || groupOrdered(fields, field.group, { ...current, [field.key]: pending[field.key]! }),
    );
    const [field] = rest.splice(Math.max(fits, 0), 1);
    current[field!.key] = pending[field!.key]!;
    order.push([field!.key, pending[field!.key]!]);
  }
  return order;
}

/** The reason the session gives a value the board did not answer about in time. */
export const NO_ANSWER = 'no answer';

/** What to show beside a field the board refused with `reason`, as its `cfg err` line names it. */
export function refusalText(field: SettingField, reason: string): string {
  switch (reason) {
    case 'armed':
      return 'The board is armed. Disarm it, then send the settings again.';
    case 'unknown':
      return 'The board does not know this setting. Flash it again.';
    case 'length':
    case 'too short':
    case 'too long':
      return lengthText(field);
    case 'number':
      return 'Use a number.';
    case 'range':
      return rangeText(field);
    case 'order':
      return 'The board refused it against the other values of its group.';
    case NO_ANSWER:
      return 'The board did not answer.';
    default:
      return `The board refused it: ${reason}.`;
  }
}
