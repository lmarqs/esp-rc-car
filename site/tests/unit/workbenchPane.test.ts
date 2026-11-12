import { describe, expect, it } from 'vitest';
import type { SessionState } from '../../src/lib/flash/session';
import type { BlinkBoard } from '../../src/lib/workbench/blinkBoard';
import {
  initialPane,
  paneAction,
  paneStatus,
  showsRefusal,
  reducePane,
  type PaneEvent,
  type PaneProject,
  type PaneState,
} from '../../src/lib/workbench/pane';
import { blinkWorkbench } from '../../src/lib/workbench/projects';

const blink = { ...blinkWorkbench, ids: ['simple', 'input', 'timer', 'commands'] } as unknown as PaneProject<BlinkBoard>;
const idle: SessionState = { kind: 'idle' };
const running: SessionState = { kind: 'running', chip: 'ESP32', output: [] };
const SIMPLE = 0;
const INPUT = 1;
const COMMANDS = 3;

/** The pane after `events`, from a page just opened. */
function after(...events: PaneEvent[]): PaneState<BlinkBoard> {
  return events.reduce((state, event) => reducePane(blink, state, event), initialPane(blink, idle));
}

const connected: PaneEvent = { kind: 'session', state: running };
const line = (text: string, at = 0): PaneEvent => ({ kind: 'line', text, at });
const tab = (index: number): PaneEvent => ({ kind: 'tab', index });
const wait = (state: PaneState<BlinkBoard>) => state.known && blink.board.variable(state.known, 'blinkDelay');
const followedWait = (state: PaneState<BlinkBoard>) =>
  state.followed && blink.board.variable(state.followed.board, 'blinkDelay');

const myBoard: PaneEvent = { kind: 'choose', chosen: 'board' };
const simulator: PaneEvent = { kind: 'choose', chosen: 'simulator' };

describe('the board pane', () => {
  it('opens on the first step, simulated, knowing nothing of a board', () => {
    const pane = initialPane(blink, idle);
    expect(pane).toMatchObject({ selected: 0, chosen: 'simulator', mode: 'simulator', following: 0, simulation: 0 });
    expect(pane.heard).toBeUndefined();
    expect(pane.followed).toBeUndefined();
    expect(paneStatus(blink, pane)).toEqual({ kind: 'simulated' });
  });

  it('opens on My board, following a board the site kept connected, when it runs the first step', () => {
    const pane = initialPane(blink, running, 'blink/simple');
    expect(pane).toMatchObject({ selected: 0, chosen: 'board', mode: 'live', heard: 'blink/simple', following: 1 });
    expect(paneStatus(blink, pane)).toEqual({ kind: 'live' });
  });

  it('opens simulated beside a board the site kept connected that runs another step', () => {
    const pane = initialPane(blink, running, 'blink/input');
    expect(pane).toMatchObject({ selected: 0, chosen: 'simulator', mode: 'simulator', heard: 'blink/input' });
    expect(paneStatus(blink, pane)).toEqual({ kind: 'step', key: 'blink/input', id: 'input' });
  });

  it('keeps simulating, Connected, until the board names its sketch', () => {
    const pane = after(connected, line('HIGH'));
    expect(pane.mode).toBe('simulator');
    expect(paneStatus(blink, pane)).toEqual({ kind: 'connected' });
    expect(pane.following).toBe(0);
  });

  it('keeps the simulator the visitor chose though the board runs the selected step', () => {
    const pane = after(connected, line('sketch blink/simple'));
    expect(pane).toMatchObject({ chosen: 'simulator', mode: 'simulator', following: 0 });
    expect(paneStatus(blink, pane)).toEqual({ kind: 'live' });
  });

  it('waits under My board, holding the simulator, until the board runs the selected step', () => {
    const before = after();
    const waiting = reducePane(blink, before, myBoard);
    expect(waiting).toMatchObject({ chosen: 'board', mode: 'waiting', following: 0, simulation: before.simulation });
    expect(after(myBoard, connected, line('HIGH')).mode).toBe('waiting');
  });

  it('follows the board under My board from the line that names the selected step, which the pane then shows', () => {
    const pane = after(myBoard, connected, line(''), line('sketch blink/simple', 5));
    expect(pane).toMatchObject({ mode: 'live', heard: 'blink/simple', following: 1 });
    expect(pane.followed?.output).toEqual([{ text: 'sketch blink/simple' }]);
    expect(paneStatus(blink, pane)).toEqual({ kind: 'live' });
  });

  it('follows at once on My board when the board already runs the selected step', () => {
    const pane = after(connected, line('sketch blink/simple'), myBoard);
    expect(pane).toMatchObject({ chosen: 'board', mode: 'live', following: 1 });
  });

  it('waits on a step the board does not run, and follows the board once its step is picked', () => {
    const other = after(myBoard, connected, line('sketch blink/commands'));
    expect(other).toMatchObject({ mode: 'waiting', following: 0 });
    expect(other.followed).toBeUndefined();
    expect(paneStatus(blink, other)).toEqual({ kind: 'step', key: 'blink/commands', id: 'commands' });

    const live = reducePane(blink, other, tab(COMMANDS));
    expect(live).toMatchObject({ chosen: 'board', mode: 'live', selected: COMMANDS, following: 1 });
    expect(reducePane(blink, other, { kind: 'sent', text: 'pause', at: 0 })).toBe(other);
  });

  it('keeps the simulator on a tab pick while the visitor chose it', () => {
    const other = after(connected, line('sketch blink/commands'), tab(COMMANDS));
    expect(other).toMatchObject({ chosen: 'simulator', mode: 'simulator', following: 0 });
  });

  it('keeps what it knew of the board when a tab pick leaves the pane waiting', () => {
    const live = after(myBoard, tab(INPUT), connected, line('sketch blink/input'), line('delay 700'));
    expect(followedWait(live)).toBe('700');
    const other = reducePane(blink, live, tab(SIMPLE));
    expect(other).toMatchObject({ chosen: 'board', mode: 'waiting', selected: SIMPLE, simulation: live.simulation });
    expect(other.followed).toBeUndefined();
    expect(wait(other)).toBe('700');
  });

  it("reads the board's lines by the step it runs while the pane shows another", () => {
    const simulated = after(tab(SIMPLE), connected, line('sketch blink/input'), line('delay 700'));
    expect(simulated.mode).toBe('simulator');
    expect(wait(simulated)).toBe('700');

    const waiting = after(myBoard, tab(SIMPLE), connected, line('sketch blink/input'), line('delay 700'));
    expect(waiting.mode).toBe('waiting');
    expect(wait(waiting)).toBe('700');
    expect(followedWait(reducePane(blink, waiting, tab(INPUT)))).toBe('700');
  });

  describe('choose simulator while live', () => {
    const live = after(myBoard, tab(INPUT), connected, line('sketch blink/input'), line('delay 700'));
    const simulated = reducePane(blink, live, simulator);

    it('hands the pane to a fresh simulator and keeps the board, still Live', () => {
      expect(simulated).toMatchObject({ chosen: 'simulator', mode: 'simulator', simulation: live.simulation + 1 });
      expect(simulated.followed).toBeUndefined();
      expect(wait(simulated)).toBe('700');
      expect(paneStatus(blink, simulated)).toEqual({ kind: 'live' });
    });

    it('counts a reply that arrives meanwhile in what the page knows, without showing it', () => {
      const replied = reducePane(blink, simulated, line('delay 500', 900));
      expect(replied.mode).toBe('simulator');
      expect(replied.followed).toBeUndefined();
      expect(wait(replied)).toBe('500');
    });

    it("takes the source's values from a sketch line that arrives meanwhile, since the board restarted", () => {
      const restarted = reducePane(blink, simulated, line('sketch blink/input'));
      expect(restarted.mode).toBe('simulator');
      expect(restarted.known).toEqual(blink.board.initial());
      expect(wait(restarted)).toBe('1000');
    });

    it('follows the board again on My board, from what the page knows', () => {
      const back = reducePane(blink, reducePane(blink, simulated, line('delay 500')), myBoard);
      expect(back).toMatchObject({ chosen: 'board', mode: 'live', following: live.following + 1 });
      expect(followedWait(back)).toBe('500');
      expect(back.followed?.output).toEqual([]);
    });

    it('stays on the simulator once the board runs another step', () => {
      const elsewhere = reducePane(blink, simulated, line('sketch blink/commands'));
      expect(elsewhere).toMatchObject({ chosen: 'simulator', mode: 'simulator', simulation: simulated.simulation });
    });

    it('changes nothing when the simulator already has the pane', () => {
      expect(reducePane(blink, simulated, simulator)).toBe(simulated);
    });

    it('starts a fresh simulator from the waiting view', () => {
      const waiting = after(myBoard);
      expect(reducePane(blink, waiting, simulator)).toMatchObject({
        chosen: 'simulator',
        mode: 'simulator',
        simulation: waiting.simulation + 1,
      });
    });
  });

  describe('a line sent to the board', () => {
    const live = after(myBoard, tab(INPUT), connected, line('sketch blink/input'));

    it('shows as sent and waits for its answer', () => {
      const sent = reducePane(blink, live, { kind: 'sent', text: '500', at: 10 });
      expect(sent.followed?.output.at(-1)).toEqual({ text: '500', sent: 1 });
      expect(sent.followed?.unanswered).toEqual([{ id: 1, text: '500' }]);
    });

    it('is taken back when the port refuses it, which the pane then says', () => {
      const sent = reducePane(blink, live, { kind: 'sent', text: '500', at: 10 });
      const refused = reducePane(blink, sent, { kind: 'refused', id: 1, pane: sent.following, text: '500' });
      expect(refused.followed?.output).toEqual(live.followed?.output);
      expect(refused.refused).toBe('500');
      expect(reducePane(blink, refused, { kind: 'sent', text: '600', at: 20 }).refused).toBeUndefined();
    });

    it('is left alone when refused after the pane changed hands', () => {
      const sent = reducePane(blink, live, { kind: 'sent', text: '500', at: 10 });
      const again = reducePane(blink, reducePane(blink, sent, simulator), myBoard);
      const late = reducePane(blink, again, { kind: 'refused', id: 1, pane: sent.following, text: '500' });
      expect(late).toBe(again);
    });

    it('goes nowhere while the simulator has the pane', () => {
      const simulated = after();
      expect(reducePane(blink, simulated, { kind: 'sent', text: '500', at: 0 })).toBe(simulated);
    });
  });

  describe('the Board switch', () => {
    it('names the first step as flashed until the visitor flashes another', () => {
      expect(after().flashed).toBe('blink/simple');
      expect(after(connected, tab(COMMANDS), { kind: 'press', action: 'flash' }).flashed).toBe('blink/commands');
    });

    it('says what the session works on after a press, until it is done', () => {
      const flashing: SessionState = { kind: 'flashing', chip: 'ESP32', pct: 10 };
      const pressed = after(connected, { kind: 'press', action: 'flash' }, { kind: 'session', state: flashing });
      expect(paneAction(blink, pressed)).toEqual({ label: 'Flashing…', icon: 'bolt', event: 'flash', disabled: true });
      expect(paneAction(blink, after(connected))).toMatchObject({ label: 'Flash simple to board', disabled: false });
    });

    it('shows a refused flash until the visitor picks another step', () => {
      const refused: SessionState = { ...running, flashRefused: { key: 'blink/simple', available: ['ESP32'] } };
      const pane = after({ kind: 'session', state: refused });
      expect(showsRefusal(pane)).toBe(true);
      expect(showsRefusal(reducePane(blink, pane, tab(INPUT)))).toBe(false);
      expect(showsRefusal(after(connected))).toBe(false);
    });
  });

  it('forgets what it heard and knew as the session connects again, and waits once the board is lost', () => {
    const live = after(myBoard, tab(INPUT), connected, line('sketch blink/input'), line('delay 700'));
    const lost = reducePane(blink, live, { kind: 'session', state: { ...running, lost: true } });
    expect(lost).toMatchObject({ chosen: 'board', mode: 'waiting', simulation: live.simulation });
    expect(lost.followed).toBeUndefined();
    expect(paneStatus(blink, lost)).toEqual({ kind: 'simulated' });
    expect(paneAction(blink, lost)).toMatchObject({ event: 'connect', label: 'Connect my board' });

    const again = reducePane(blink, lost, { kind: 'session', state: { kind: 'connecting' } });
    expect(again.heard).toBeUndefined();
    expect(again.known).toBeUndefined();
  });
});

describe('a board left in flash mode after a flash', () => {
  const esp8266: SessionState = { kind: 'running', chip: 'ESP8266', output: [] };
  const flashMode: PaneEvent = { kind: 'session', state: { kind: 'flashMode', chip: 'ESP8266' } };
  const connecting: PaneEvent = { kind: 'session', state: { kind: 'connecting' } };

  it('is live on the written step once read again, though the port opened too late to hear it', () => {
    const state = after(
      { kind: 'session', state: esp8266 },
      tab(INPUT),
      { kind: 'press', action: 'flash' },
      flashMode,
      connecting,
      { kind: 'session', state: esp8266 },
    );

    expect(paneStatus(blink, state)).toEqual({ kind: 'live' });
  });

  it('is live on the written step after a reconnect that failed first', () => {
    const noPort: PaneEvent = { kind: 'session', state: { kind: 'noPort', awaitingRun: true } };
    const state = after(
      { kind: 'session', state: esp8266 },
      tab(INPUT),
      { kind: 'press', action: 'flash' },
      flashMode,
      connecting,
      noPort,
      connecting,
      { kind: 'session', state: esp8266 },
    );

    expect(paneStatus(blink, state)).toEqual({ kind: 'live' });
  });

  it('offers to connect while the board waits in flash mode', () => {
    const state = after({ kind: 'session', state: esp8266 }, { kind: 'press', action: 'flash' }, flashMode);

    expect(paneAction(blink, state)).toMatchObject({ event: 'connect', label: 'Connect my board' });
  });
});
