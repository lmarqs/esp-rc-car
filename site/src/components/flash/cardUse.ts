import type { BoardUse } from '../../lib/board/board';
import type { Manifest } from '../../lib/flash/manifest';

/** What a flash card, from its data attributes, points the board's session at when its sketch is the one open. */
export function cardUse(card: HTMLElement): BoardUse {
  const { sketch, baud } = card.dataset;
  return {
    manifest: JSON.parse(card.dataset.manifest!) as Manifest,
    sketch: sketch!,
    baud: baud ? Number(baud) : undefined,
  };
}
