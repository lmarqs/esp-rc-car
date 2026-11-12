import type { Board } from '../../lib/board/board';
import type { KeptLine } from '../../lib/board/record';

/** The dock's serial monitor: the lines the board printed and was sent, and the line to send it. */
export interface DockMonitor {
  /** Paints the board's lines while the monitor is open; `canSend` is whether a line can go to the board now. */
  show(canSend: boolean): void;
}

/** The serial monitor in `dock` and the Serial button that opens it, which show and send `board`'s lines. */
export function mountDockMonitor(dock: HTMLElement, board: Board): DockMonitor {
  const find = <E extends Element>(name: string) => dock.querySelector<E>(`[data-dock-${name}]`)!;
  const monitor = find<HTMLElement>('monitor');
  const lines = find<HTMLElement>('lines');
  const form = find<HTMLFormElement>('send');
  const input = find<HTMLInputElement>('line');
  const send = form.querySelector<HTMLButtonElement>('button')!;
  const problem = find<HTMLElement>('problem');
  const serial = find<HTMLButtonElement>('serial');
  let shownLines: readonly KeptLine[] | undefined;
  let sendable = false;

  serial.addEventListener('click', () => {
    const open = monitor.hidden;
    monitor.hidden = !open;
    serial.setAttribute('aria-expanded', String(open));
    shownLines = undefined;
    show(sendable);
    if (open) input.focus();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value;
    if (text === '') return;
    input.value = '';
    problem.hidden = true;
    board.sendLine(text).catch(() => {
      problem.textContent = `The board did not get ${text}. Check that it is still plugged in, then send it again.`;
      problem.hidden = false;
    });
  });

  /** Writes the kept lines into the monitor, following the newest unless the visitor scrolled up to read. */
  function paintLines() {
    const kept = board.record.lines;
    if (kept === shownLines) return;
    shownLines = kept;
    const following = lines.scrollHeight - lines.scrollTop - lines.clientHeight < 8;
    lines.replaceChildren(
      ...kept.map((line, at) => {
        const row = document.createElement('span');
        row.textContent = (at > 0 ? '\n' : '') + (line.sent ? `› ${line.text}` : line.text);
        if (line.sent) row.dataset.sent = '';
        return row;
      }),
    );
    if (following) lines.scrollTop = lines.scrollHeight;
  }

  function show(canSend: boolean) {
    sendable = canSend;
    input.disabled = !canSend;
    send.disabled = !canSend;
    if (!monitor.hidden) paintLines();
  }

  return { show };
}
