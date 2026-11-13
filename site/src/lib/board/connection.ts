import { wording, type SessionState } from '../flash';
import type { BoardModel } from './models';

/** What the board pane shows in place of the picture while the page talks to the board, or after it failed. */
export interface BoardMessage {
  readonly text: string;
  /** Shown as a notice: a state that is not part of the happy path. */
  readonly notice: boolean;
}

/** What to do after a flash failed: the session let go of the port, and the button tries it all again. */
const RETRY = 'Then press Try again.';

/**
 * The board pane's message for the session's `state`, or `undefined` when the pane shows the picture. `key` is the
 * step last flashed, which a missing image names. `showRefusal` keeps the refusal of a step with no image for the
 * board on screen; the page drops it once the visitor picks another step.
 */
export function boardMessage(
  state: SessionState,
  key: string,
  showRefusal: boolean,
  board?: BoardModel,
): BoardMessage | undefined {
  const notice = (text: string): BoardMessage => ({ text, notice: true });
  switch (state.kind) {
    case 'connecting':
      return { text: wording.CONNECTING, notice: false };
    case 'flashing':
      return { text: `${wording.found(state.chip)}. Keep the board plugged in.`, notice: false };
    case 'flashMode':
      return notice(wording.FLASH_MODE);
    case 'noPort':
      return notice(wording.NO_PORT);
    case 'portBusy':
      return notice(wording.PORT_BUSY);
    case 'noAnswer':
      return notice(wording.noAnswer(board));
    case 'noImage':
      return notice(`${wording.noImage(state, key)} ${wording.otherBoardOrStep(state.available)}`);
    case 'noDownload':
      return notice(`${wording.NO_DOWNLOAD}. ${RETRY}`);
    case 'dropped':
      return notice(`${wording.droppedAt(state.pct)} Plug the board back in. ${RETRY}`);
    case 'running':
      if (state.lost) return notice(wording.LOST);
      if (state.flashRefused !== undefined && showRefusal) {
        const { key: refused, available } = state.flashRefused;
        const why = wording.noImage({ kind: 'noImage', chip: state.chip, available }, refused);
        return notice(`${why} ${wording.otherBoardOrStep(available)}`);
      }
      return undefined;
    default:
      return undefined;
  }
}
