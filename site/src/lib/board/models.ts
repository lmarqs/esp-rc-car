import type { ChipFamily } from '../flash/manifest';

/** A board the site can flash, as the visitor knows it, and the chip its bootloader names when it connects. */
export interface BoardModel {
  readonly id: string;
  readonly name: string;
  /** What tells it apart in the visitor's hand. */
  readonly look: string;
  readonly chip: ChipFamily;
}

/** The boards the site has images for, one per chip, so the chip that answers names the board. */
export const BOARD_MODELS: readonly BoardModel[] = [
  { id: 'esp32', name: 'ESP32 dev board', look: 'USB socket and a BOOT button', chip: 'ESP32' },
  { id: 'esp32c3', name: 'ESP32-C3', look: 'Small board, USB-C', chip: 'ESP32-C3' },
  { id: 'esp01s', name: 'ESP-01S', look: 'Stamp-sized, in a USB adapter', chip: 'ESP8266' },
];

export function boardModel(id: string): BoardModel | undefined {
  return BOARD_MODELS.find((model) => model.id === id);
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

/** What the site says when the chip that answered is not the picked board's, so it follows `answering` instead. */
export function correctionNotice(picked: BoardModel, answering: BoardModel): string {
  return `You picked an ${picked.name}, but an ${answering.chip} answered. The site now follows the ${answering.name}.`;
}
