import { describe, expect, it } from 'vitest';
import { viewFor } from '../../src/components/flash/view';

const context = { title: 'Blink' };

describe('viewFor', () => {
  it('asks to connect while idle', () => {
    expect(viewFor({ kind: 'idle' }, context)).toEqual({
      step: 'connect',
      message: 'Plug the board in over USB. This replaces whatever is on the board.',
      action: { label: 'Connect board', event: 'connect' },
    });
  });

  it('offers no button while connecting', () => {
    expect(viewFor({ kind: 'connecting' }, context).action).toBeUndefined();
  });

  it('shows the chip and the percentage while flashing, with no button', () => {
    const view = viewFor({ kind: 'flashing', chip: 'ESP32', pct: 42 }, context);

    expect(view).toEqual({ step: 'flash', message: 'Found ESP32', progress: 42 });
  });

  it('says the board runs, then what to do next', () => {
    const view = viewFor({ kind: 'running', chip: 'ESP32' }, { title: 'Blink', next: 'Open the monitor.' });

    expect(view.step).toBe('running');
    expect(view.message).toBe('Your board is running Blink. Open the monitor.');
  });

  it('says only that the board runs when the project has no next step', () => {
    expect(viewFor({ kind: 'running', chip: 'ESP32' }, context).message).toBe('Your board is running Blink.');
  });

  it('shows a failure as a notice with a button that sends retry', () => {
    const view = viewFor({ kind: 'noPort' }, context);

    expect(view.notice).toBe(true);
    expect(view.action).toEqual({ label: 'Try again', event: 'retry' });
  });

  it('shows no retry where the browser cannot flash', () => {
    expect(viewFor({ kind: 'unsupported' }, context).action).toBeUndefined();
  });
});
