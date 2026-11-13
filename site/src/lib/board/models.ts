import type { ChipFamily } from '../flash/manifest';

/** A board the site can flash, as the visitor knows it, and the chip its bootloader names when it connects. */
export interface BoardModel {
  readonly id: string;
  readonly name: string;
  /** What tells it apart in the visitor's hand. */
  readonly look: string;
  readonly chip: ChipFamily;
  /**
   * Set for a board whose USB adapter puts it in flash mode with a switch or a jumper, set before the adapter gets
   * power. Otherwise the board has a BOOT button to hold when it does not answer.
   */
  readonly flashSwitch?: true;
}

/** The boards the site has images for, one per chip, so the chip that answers names the board. */
export const BOARD_MODELS: readonly BoardModel[] = [
  { id: 'esp32', name: 'ESP32 dev board', look: 'USB socket and a BOOT button', chip: 'ESP32' },
  { id: 'esp32c3', name: 'ESP32-C3', look: 'Small board, USB-C', chip: 'ESP32-C3' },
  { id: 'esp01s', name: 'ESP-01S', look: 'Stamp-sized, in a USB adapter', chip: 'ESP8266', flashSwitch: true },
];

export function boardModel(id: string): BoardModel | undefined {
  return BOARD_MODELS.find((model) => model.id === id);
}

/**
 * The connection that restarts `model` into its sketch to read it: a board on an adapter with a flash switch reaches
 * its bootloader only in flash mode, so it is read as it runs, as the chip it is.
 */
export function restartConnection(model: BoardModel | undefined): { type: 'connect'; reset: true; listen?: string } {
  return model?.flashSwitch ? { type: 'connect', reset: true, listen: model.chip } : { type: 'connect', reset: true };
}

/**
 * The board the site follows once `chip` answered: the pick when its chip is that one, or else the model of that chip.
 * A chip the list does not know leaves the pick as it is.
 */
export function modelAnswering(picked: BoardModel | undefined, chip: string): BoardModel | undefined {
  if (picked?.chip === chip) return picked;
  return BOARD_MODELS.find((model) => model.chip === chip) ?? picked;
}

/** The models whose chip is one of `chips`, in the list's order. */
export function modelsWithImages(chips: readonly string[]): BoardModel[] {
  return BOARD_MODELS.filter((model) => chips.includes(model.chip));
}

/** What a project's card says of the boards it runs on, `models`, for the board the visitor picked, if any. */
export function boardsLine(models: readonly BoardModel[], picked: BoardModel | undefined): { text: string; fits?: boolean } {
  const names = models.map((model) => model.name);
  if (picked === undefined) return { text: `Runs on ${joinOr(names, 'and')}` };
  if (models.includes(picked)) return { text: `Runs on your ${picked.name}`, fits: true };
  return { text: `Needs an ${joinOr(names, 'or')}`, fits: false };
}

function joinOr(names: readonly string[], word: 'and' | 'or'): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} ${word} ${names.at(-1)}`;
}
