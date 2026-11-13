import type { BoardModel } from '../board/models';

/**
 * The plain words for what a flash session is doing or why it stopped, which the board's connection and the dock show,
 * and the card for a browser that cannot flash. A sentence that tells the visitor which button to press next is left
 * to the caller, which knows its buttons.
 */
export const CONNECTING = 'Connecting to the board.';
/** Why the page cannot flash in this browser, and what to do instead; `UNSUPPORTED` says both. */
export const NO_WEB_SERIAL = 'This browser cannot reach a USB board.';
export const USE_CHROME_OR_EDGE = 'Open this page in Chrome or Edge on a computer.';
export const UNSUPPORTED = `${NO_WEB_SERIAL} ${USE_CHROME_OR_EDGE}`;
export const NO_PORT = 'No board was chosen. Plug it in and try again.';
export const PORT_BUSY =
  'Another program is using the board. Close the serial monitor or the Arduino IDE, then connect again.';
export const NO_ANSWER =
  'The board did not answer. Hold its BOOT button and connect again. On an ESP-01S, set the USB adapter to flash mode first.';

/** Why the board did not answer and what to do, for the board the visitor picked, if any. */
export function noAnswer(board: BoardModel | undefined): string {
  if (board === undefined) return NO_ANSWER;
  if (board.flashSwitch) {
    return (
      "The board did not answer. Set the adapter's switch to PROG, the flash position, or put its jumper on. " +
      'Then unplug the adapter, plug the adapter back in and connect again.'
    );
  }
  return 'The board did not answer. Hold its BOOT button and connect again.';
}

/** An ESP8266 that its adapter keeps in flash mode after the write. */
export const FLASH_MODE =
  'The sketch is on the board, but the board is still in flash mode. To start it, set the adapter\'s switch to UART, ' +
  'the run position, or take its jumper off. Then unplug the adapter, plug the adapter back in and connect again.';
/** What a board whose port was lost did, and what to do. */
export const LOST = 'The board stopped talking to the page. Plug it back in and connect again.';
/** The download failed; the caller ends the sentence with what to do. */
export const NO_DOWNLOAD = 'The image did not download. Check your internet connection';

export function found(chip: string): string {
  return `Found ${chip}`;
}

/**
 * Why a board of `chip` cannot be flashed with the sketch `title` names, a project or a step as the site names it, or
 * else a sketch's key: its images are for the chips `available`.
 */
export function noImage(chip: string, available: readonly string[], title: string): string {
  const images = available.length === 0 ? 'has no image to flash from the browser' : `has images for: ${available.join(', ')}`;
  return `This board is an ${chip}. ${title} ${images}.`;
}

/**
 * What to do when a sketch has no image for the board: use a board it has images for, `available`, or, for a `step` of
 * a workbench, another step.
 */
export function otherBoardOrStep(available: readonly string[], step: boolean): string {
  if (available.length === 0) return step ? 'Pick another step.' : 'Build and flash it from your computer instead.';
  const board = `Connect an ${available.join(' or ')}`;
  return step ? `${board}, or pick another step.` : `${board}.`;
}

/** The flash dropped part way; the caller adds what to do. */
export function droppedAt(pct: number): string {
  return `The connection dropped at ${pct}%. Nothing is broken.`;
}
