/**
 * The tab a key moves to in a row of `count` tabs from tab `current`, by the WAI-ARIA tabs pattern: the arrow keys
 * move to the next or previous tab and wrap around, Home and End move to the first and last. `undefined` for any
 * other key.
 */
export function tabAfterKey(key: string, current: number, count: number): number | undefined {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (current + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return undefined;
  }
}
