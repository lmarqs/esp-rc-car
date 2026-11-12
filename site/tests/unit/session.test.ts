import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadError, type Flasher } from '../../src/lib/flash/flasher';
import type { Manifest } from '../../src/lib/flash/manifest';
import { createSession, isBusy, type SessionState } from '../../src/lib/flash/session';

const parts = [
  { path: 'servo/bluepad32/servo.ino.bootloader.bin', offset: 4096 },
  { path: 'servo/bluepad32/servo.ino.bin', offset: 65536 },
];

const manifest: Manifest = {
  sketches: {
    servo: { images: [{ profile: 'bluepad32', chipFamily: 'ESP32', parts }] },
    'web-relay': {
      images: [
        { profile: 'esp32', chipFamily: 'ESP32', parts },
        { profile: 'esp01', chipFamily: 'ESP8266', parts: [{ path: 'web-relay/esp01/web-relay.ino.bin', offset: 0 }] },
      ],
      settings: [
        { key: 'ap_ssid', label: 'Hotspot name', type: 'text', default: 'web-relay', minLength: 1, maxLength: 32 },
        { key: 'ap_password', label: 'Hotspot password', type: 'password', default: 'web-relay-1234', minLength: 8 },
        { key: 'low', label: 'Low', type: 'number', default: 0, min: 0, max: 1, group: 'band' },
        { key: 'high', label: 'High', type: 'number', default: 0, min: 0, max: 1, group: 'band' },
      ],
    },
  },
};

/** The form of web-relay as it opens: each field at its default. */
const DEFAULTS = { ap_ssid: 'web-relay', ap_password: 'web-relay-1234', low: '0', high: '0' };

interface FakeFlasher extends Flasher {
  calls: string[];
  /** Prints lines on the monitor that the session started; fails the test when there is none. */
  print(...lines: string[]): void;
  /** Ends the monitor the way a lost port does, or fails it with `error`. */
  endMonitor(error?: unknown): void;
}

interface FakeFlasherOptions {
  chip?: string;
  /** The lines the board prints in answer to each line sent to it. Default: none. */
  answer?: (line: string) => string[];
  progress?: number[];
  failAt?: Partial<Record<'connect' | 'load' | 'write' | 'reset', unknown>>;
  /** The write waits for this before it reports progress. */
  writeGate?: Promise<void>;
}

/** A flasher that connects to `chip`, writes by reporting each of `progress`, and fails where `failAt` says. */
function fakeFlasher(options: FakeFlasherOptions = {}): FakeFlasher {
  const { chip = 'ESP32', progress = [10, 50, 100], failAt = {}, writeGate, answer = () => [] } = options;
  const calls: string[] = [];
  let onLines: ((lines: string[]) => void) | undefined;
  let endMonitor = (_error?: unknown) => {};
  return {
    calls,
    print(...lines) {
      onLines!(lines);
    },
    endMonitor: (error) => endMonitor(error),
    async monitor(baud, listener) {
      calls.push(`monitor ${baud}`);
      onLines = listener;
      await new Promise<void>((resolve, reject) => {
        endMonitor = (error) => (error === undefined ? resolve() : reject(error));
      });
    },
    async send(line) {
      calls.push(`send ${line}`);
      const lines = answer(line);
      if (lines.length > 0) {
        queueMicrotask(() => onLines!(lines));
      }
    },
    async connect() {
      calls.push('connect');
      if ('connect' in failAt) {
        throw failAt.connect;
      }
      return chip;
    },
    async load() {
      calls.push('load');
      if ('load' in failAt) {
        throw failAt.load;
      }
    },
    async write(written, onProgress) {
      calls.push(`write ${written.map((part) => part.offset).join(',')}`);
      await writeGate;
      for (const pct of progress) {
        onProgress(pct);
      }
      if ('write' in failAt) {
        throw failAt.write;
      }
    },
    async reset() {
      calls.push('reset');
      if ('reset' in failAt) {
        throw failAt.reset;
      }
    },
    async disconnect() {
      calls.push('disconnect');
    },
  };
}

function record(session: ReturnType<typeof createSession>) {
  const states: SessionState[] = [];
  session.subscribe((state) => states.push(state));
  return states;
}

const domError = (name: string) => new DOMException('refused', name);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a session without Web Serial', () => {
  it('starts unsupported and ignores every event', async () => {
    const session = createSession({ flasher: null, manifest, sketch: 'servo' });
    const states = record(session);

    await session.send({ type: 'connect' });
    await session.send({ type: 'retry' });

    expect(session.state).toEqual({ kind: 'unsupported' });
    expect(states).toEqual([]);
  });
});

describe('a session for a sketch without settings', () => {
  it('starts idle', () => {
    expect(createSession({ flasher: fakeFlasher(), manifest, sketch: 'servo' }).state).toEqual({ kind: 'idle' });
  });

  it('goes from connecting straight to flashing and then running', async () => {
    const flasher = fakeFlasher();
    const session = createSession({ flasher, manifest, sketch: 'servo' });
    const states = record(session);

    await session.send({ type: 'connect' });

    expect(states).toEqual([
      { kind: 'connecting' },
      { kind: 'flashing', chip: 'ESP32', pct: 0 },
      { kind: 'flashing', chip: 'ESP32', pct: 10 },
      { kind: 'flashing', chip: 'ESP32', pct: 50 },
      { kind: 'flashing', chip: 'ESP32', pct: 100 },
      { kind: 'running', chip: 'ESP32', output: [] },
    ]);
    expect(flasher.calls).toEqual(['connect', 'load', 'write 4096,65536', 'reset']);
  });

  it('reports only progress that moves forward, within 0 to 100', async () => {
    const flasher = fakeFlasher({ progress: [20, 20, 15, 140, -3] });
    const session = createSession({ flasher, manifest, sketch: 'servo' });
    const states = record(session);

    await session.send({ type: 'connect' });

    expect(states.filter((state) => state.kind === 'flashing').map((state) => 'pct' in state && state.pct)).toEqual([
      0, 20, 100,
    ]);
  });

  it('starts no second flash while one is under way', async () => {
    const flasher = fakeFlasher();
    const session = createSession({ flasher, manifest, sketch: 'servo' });

    const first = session.send({ type: 'connect' });
    await session.send({ type: 'connect' });
    await first;

    expect(flasher.calls.filter((call) => call === 'connect')).toHaveLength(1);
  });

  it('releases the port and returns to idle on retry from running', async () => {
    const flasher = fakeFlasher();
    const session = createSession({ flasher, manifest, sketch: 'servo' });
    await session.send({ type: 'connect' });

    await session.send({ type: 'retry' });

    expect(session.state).toEqual({ kind: 'idle' });
    expect(flasher.calls.at(-1)).toBe('disconnect');
  });

  it('releases the port and returns to idle on disconnect from running', async () => {
    const flasher = fakeFlasher();
    const session = createSession({ flasher, manifest, sketch: 'servo' });
    await session.send({ type: 'connect' });

    await session.send({ type: 'disconnect' });

    expect(session.state).toEqual({ kind: 'idle', released: true });
    expect(flasher.calls.at(-1)).toBe('disconnect');
  });

  it('ignores disconnect outside running', async () => {
    const flasher = fakeFlasher();
    const session = createSession({ flasher, manifest, sketch: 'servo' });

    await session.send({ type: 'disconnect' });

    expect(session.state).toEqual({ kind: 'idle' });
    expect(flasher.calls).toEqual([]);
  });

  it('ignores submitSettings outside settings', async () => {
    const flasher = fakeFlasher();
    const session = createSession({ flasher, manifest, sketch: 'servo' });

    await session.send({ type: 'submitSettings', values: {} });

    expect(session.state).toEqual({ kind: 'idle' });
    expect(flasher.calls).toEqual([]);
  });

  it('stops notifying a listener that unsubscribed', async () => {
    const session = createSession({ flasher: fakeFlasher(), manifest, sketch: 'servo' });
    const listener = vi.fn();
    session.subscribe(listener)();

    await session.send({ type: 'connect' });

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('a session for a sketch with settings', () => {
  const BOARD = { ap_ssid: 'web-relay', ap_password: 'unset', low: '0', high: '0' };

  /**
   * A board that holds `stored`, as the sketch's `cfg` protocol answers: `cfg get` lists them, and `cfg set` stores a
   * value unless `refuse` names its key, with the reason to refuse it with.
   */
  function board(stored: Record<string, string> = BOARD, refuse: Record<string, string> = {}) {
    const values = { ...stored };
    return (line: string): string[] => {
      if (line === 'cfg get') {
        return [...Object.entries(values).map(([key, value]) => `cfg ${key}=${value}`), 'cfg end'];
      }
      const set = /^cfg set (\S+) (.*)$/.exec(line);
      if (set) {
        const [, key, value] = set as unknown as [string, string, string];
        if (key in refuse) {
          return [`cfg err ${key} ${refuse[key]}`];
        }
        values[key] = value;
        return [`cfg ok ${key}`];
      }
      return [];
    };
  }

  async function connected(options: FakeFlasherOptions = {}) {
    const flasher = fakeFlasher({ answer: board(), ...options });
    const session = createSession({ flasher, manifest, sketch: 'web-relay', baud: 115200 });
    const states = record(session);
    await session.send({ type: 'connect' });
    return { flasher, session, states };
  }

  const sent = (flasher: FakeFlasher) => flasher.calls.filter((call) => call.startsWith('send '));

  it('waits in settings after connecting, then flashes and reads what the board holds', async () => {
    const { flasher, session, states } = await connected();

    expect(session.state).toEqual({ kind: 'settings', chip: 'ESP32' });
    expect(flasher.calls).toEqual(['connect']);

    await session.send({ type: 'submitSettings', values: DEFAULTS });

    expect(states.map((state) => state.kind)).toEqual([
      'connecting',
      'settings',
      'flashing',
      'flashing',
      'flashing',
      'flashing',
      'applying',
      'running',
    ]);
    expect(flasher.calls).toEqual(['connect', 'load', 'write 4096,65536', 'reset', 'monitor 115200', 'send cfg get']);
    expect(session.state).toEqual({ kind: 'running', chip: 'ESP32', output: [] });
  });

  it('writes the parts of the image built for the chip it found', async () => {
    const { flasher, session } = await connected({ chip: 'ESP8266' });

    await session.send({ type: 'submitSettings', values: DEFAULTS });

    expect(flasher.calls).toContain('write 0');
  });

  it('sends each changed value, one at a time and keeping a group ordered, then restarts the board', async () => {
    const { flasher, session } = await connected();

    await session.send({ type: 'submitSettings', values: { ...DEFAULTS, ap_ssid: 'lamp', low: '0.2', high: '0.4' } });

    expect(sent(flasher)).toEqual([
      'send cfg get',
      'send cfg set ap_ssid lamp',
      'send cfg set high 0.4',
      'send cfg set low 0.2',
      'send cfg restart',
    ]);
    expect(session.state).toEqual({ kind: 'running', chip: 'ESP32', output: [] });
  });

  it('sends a default the board holds another value for, since flashing keeps what it stored', async () => {
    const { flasher, session } = await connected({ answer: board({ ...BOARD, ap_ssid: 'old' }) });

    await session.send({ type: 'submitSettings', values: DEFAULTS });

    expect(sent(flasher)).toEqual(['send cfg get', 'send cfg set ap_ssid web-relay', 'send cfg restart']);
  });

  it('names what is wrong with each value before it flashes anything', async () => {
    const { flasher, session } = await connected();

    await session.send({ type: 'submitSettings', values: { ...DEFAULTS, ap_password: 'short', low: '2' } });

    expect(session.state).toEqual({
      kind: 'settings',
      chip: 'ESP32',
      errors: { ap_password: 'Use at least 8 characters.', low: 'Use a number from 0 to 1.' },
    });
    expect(flasher.calls).toEqual(['connect']);
  });

  it('keeps the visitor on the form with each refusal beside its field, and does not restart the board', async () => {
    const { flasher, session } = await connected({ answer: board(BOARD, { high: 'armed' }) });

    await session.send({ type: 'submitSettings', values: { ...DEFAULTS, ap_ssid: 'lamp', high: '0.5' } });

    expect(session.state).toEqual({
      kind: 'settings',
      chip: 'ESP32',
      flashed: true,
      errors: { high: 'The board is armed. Disarm it, then send the settings again.' },
    });
    expect(sent(flasher)).toEqual(['send cfg get', 'send cfg set ap_ssid lamp', 'send cfg set high 0.5']);
  });

  it('sends the values again without flashing, and only those the board does not hold yet', async () => {
    const refusing = board(BOARD, { high: 'armed' });
    let armed = true;
    const { flasher, session } = await connected({
      answer: (line) => (armed || !line.startsWith('cfg set high') ? refusing(line) : [`cfg ok high`]),
    });
    await session.send({ type: 'submitSettings', values: { ...DEFAULTS, ap_ssid: 'lamp', high: '0.5' } });
    flasher.calls.length = 0;
    armed = false;

    await session.send({ type: 'submitSettings', values: { ...DEFAULTS, ap_ssid: 'lamp', high: '0.5' } });

    expect(flasher.calls).toEqual(['send cfg get', 'send cfg set high 0.5', 'send cfg restart']);
    expect(session.state).toEqual({ kind: 'running', chip: 'ESP32', output: [] });
  });

  it('reports a value the board does not answer about within 3 seconds', async () => {
    vi.useFakeTimers();
    try {
      const silent = board();
      const { flasher, session } = await connected({
        answer: (line) => (line.startsWith('cfg set') ? [] : silent(line)),
      });

      const applying = session.send({ type: 'submitSettings', values: { ...DEFAULTS, ap_ssid: 'lamp' } });
      await vi.advanceTimersByTimeAsync(2999);
      expect(session.state.kind).toBe('applying');
      await vi.advanceTimersByTimeAsync(1);
      await applying;

      expect(session.state).toEqual({
        kind: 'settings',
        chip: 'ESP32',
        flashed: true,
        errors: { ap_ssid: 'The board did not answer.' },
      });
      expect(sent(flasher)).toEqual(['send cfg get', 'send cfg set ap_ssid lamp']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks the board for its settings every second until it lists them', async () => {
    vi.useFakeTimers();
    try {
      const starting = board();
      let asked = 0;
      const { flasher, session } = await connected({
        answer: (line) => (line === 'cfg get' && ++asked < 3 ? [] : starting(line)),
      });

      const applying = session.send({ type: 'submitSettings', values: DEFAULTS });
      await vi.advanceTimersByTimeAsync(2000);
      await applying;

      expect(sent(flasher)).toEqual(['send cfg get', 'send cfg get', 'send cfg get']);
      expect(session.state.kind).toBe('running');
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after 10 tries and stays on the form, saying the board did not answer', async () => {
    vi.useFakeTimers();
    try {
      const { flasher, session } = await connected({ answer: () => [] });

      const applying = session.send({ type: 'submitSettings', values: DEFAULTS });
      await vi.advanceTimersByTimeAsync(10_000);
      await applying;

      expect(sent(flasher)).toEqual(Array(10).fill('send cfg get'));
      expect(session.state).toEqual({ kind: 'settings', chip: 'ESP32', flashed: true, noAnswer: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks the board lost when the port goes while it sends the settings', async () => {
    vi.useFakeTimers();
    try {
      const { flasher, session } = await connected({ answer: () => [] });
      const applying = session.send({ type: 'submitSettings', values: DEFAULTS });
      await vi.advanceTimersByTimeAsync(0);

      flasher.endMonitor();
      await vi.advanceTimersByTimeAsync(1000);
      await applying;

      expect(session.state).toEqual({ kind: 'running', chip: 'ESP32', output: [], lost: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves the form for the Flash step before it downloads the image, and ignores the form meanwhile', async () => {
    let finishLoad!: () => void;
    const { flasher, session } = await connected();
    const load = flasher.load;
    flasher.load = async (parts) => {
      await load(parts);
      await new Promise<void>((resolve) => (finishLoad = resolve));
    };

    const flashing = session.send({ type: 'submitSettings', values: DEFAULTS });

    expect(session.state).toEqual({ kind: 'flashing', chip: 'ESP32', pct: 0 });
    await session.send({ type: 'submitSettings', values: DEFAULTS });
    expect(flasher.calls.filter((call) => call === 'load')).toHaveLength(1);
    finishLoad();
    await flashing;
    expect(session.state.kind).toBe('running');
  });

  it('sends the default password over one the board stores, which may be another', async () => {
    const { flasher, session } = await connected({ answer: board({ ...BOARD, ap_password: 'set' }) });

    await session.send({ type: 'submitSettings', values: DEFAULTS });

    expect(sent(flasher)).toEqual(['send cfg get', 'send cfg set ap_password web-relay-1234', 'send cfg restart']);
  });

  it('asks again when a list misses a field, as when it began before the cfg get it ends', async () => {
    vi.useFakeTimers();
    try {
      const full = board();
      let asked = 0;
      const { flasher, session } = await connected({
        answer: (line) => (line === 'cfg get' && ++asked === 1 ? ['cfg low=0', 'cfg high=0', 'cfg end'] : full(line)),
      });

      const applying = session.send({ type: 'submitSettings', values: DEFAULTS });
      await vi.advanceTimersByTimeAsync(1000);
      await applying;

      expect(sent(flasher)).toEqual(['send cfg get', 'send cfg get']);
      expect(session.state.kind).toBe('running');
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves the rest of a group in the form once the board refuses one of it', async () => {
    const { flasher, session } = await connected({ answer: board(BOARD, { high: 'armed' }) });

    await session.send({ type: 'submitSettings', values: { ...DEFAULTS, low: '0.2', high: '0.4' } });

    expect(sent(flasher)).toEqual(['send cfg get', 'send cfg set high 0.4']);
    expect(session.state).toEqual({
      kind: 'settings',
      chip: 'ESP32',
      flashed: true,
      errors: { high: 'The board is armed. Disarm it, then send the settings again.' },
    });
  });

  it('marks the board lost when the port goes as the board restarts', async () => {
    const answer = board();
    const { flasher, session } = await connected({
      answer: (line) => {
        if (line === 'cfg restart') flasher.endMonitor();
        return answer(line);
      },
    });

    await session.send({ type: 'submitSettings', values: { ...DEFAULTS, ap_ssid: 'lamp' } });

    expect(sent(flasher).at(-1)).toBe('send cfg restart');
    expect(session.state).toEqual({ kind: 'running', chip: 'ESP32', output: [], lost: true });
  });

  it('waits past the reply about another key, and shows the lines the board prints meanwhile', async () => {
    const answer = board();
    const { flasher, session } = await connected({
      answer: (line) => {
        if (line === 'cfg get') return ['booting', ...answer(line)];
        if (line.startsWith('cfg set ap_ssid')) return ['cfg ok other', 'cfg err - syntax', ...answer(line)];
        return answer(line);
      },
    });

    await session.send({ type: 'submitSettings', values: { ...DEFAULTS, ap_ssid: 'lamp' } });

    expect(sent(flasher)).toEqual(['send cfg get', 'send cfg set ap_ssid lamp', 'send cfg restart']);
    expect(session.state).toEqual({ kind: 'running', chip: 'ESP32', output: ['booting'] });
  });

  it('keeps the lines of the protocol out of the output', async () => {
    const { flasher, session } = await connected();
    await session.send({ type: 'submitSettings', values: DEFAULTS });

    flasher.print('cfg ap_ssid=web-relay', 'HIGH', 'cfg end', 'cfg err - syntax');

    expect(session.state).toEqual({ kind: 'running', chip: 'ESP32', output: ['HIGH'] });
  });

  it('reopens the form from running, and sends the values without flashing', async () => {
    const { flasher, session } = await connected();
    await session.send({ type: 'submitSettings', values: DEFAULTS });
    flasher.calls.length = 0;

    await session.send({ type: 'changeSettings' });

    expect(session.state).toEqual({ kind: 'settings', chip: 'ESP32', flashed: true });

    await session.send({ type: 'submitSettings', values: { ...DEFAULTS, ap_password: 'a-new-secret' } });

    expect(flasher.calls).toEqual(['send cfg get', 'send cfg set ap_password a-new-secret', 'send cfg restart']);
    expect(session.state.kind).toBe('running');
  });

  it('returns to running with its lines when the visitor closes the reopened form', async () => {
    const { flasher, session } = await connected();
    await session.send({ type: 'submitSettings', values: DEFAULTS });
    flasher.print('HIGH');
    await session.send({ type: 'changeSettings' });
    flasher.print('LOW');

    await session.send({ type: 'closeSettings' });

    expect(session.state).toEqual({ kind: 'running', chip: 'ESP32', output: ['HIGH', 'LOW'] });
  });

  it('ignores closeSettings on the form before the flash', async () => {
    const { session } = await connected();

    await session.send({ type: 'closeSettings' });

    expect(session.state).toEqual({ kind: 'settings', chip: 'ESP32' });
  });

  it('ignores changeSettings for a sketch without settings', async () => {
    const flasher = fakeFlasher();
    const session = createSession({ flasher, manifest, sketch: 'servo', baud: 9600 });
    await session.send({ type: 'connect' });

    await session.send({ type: 'changeSettings' });

    expect(session.state.kind).toBe('running');
  });

  it('asks for no settings when the sketch prints nothing, since the board answers on that port', async () => {
    const flasher = fakeFlasher();
    const session = createSession({ flasher, manifest, sketch: 'web-relay' });

    await session.send({ type: 'connect' });

    expect(session.state).toEqual({ kind: 'running', chip: 'ESP32', output: [] });
  });

  it('is busy while it sends the settings', () => {
    expect(isBusy({ kind: 'applying', chip: 'ESP32' })).toBe(true);
    expect(isBusy({ kind: 'settings', chip: 'ESP32', flashed: true })).toBe(true);
    expect(isBusy({ kind: 'running', chip: 'ESP32', output: [] })).toBe(false);
  });

  it('releases the port and returns to idle on retry from settings', async () => {
    const { flasher, session } = await connected();

    await session.send({ type: 'retry' });

    expect(session.state).toEqual({ kind: 'idle' });
    expect(flasher.calls).toEqual(['connect', 'disconnect']);
  });
});

describe('failures', () => {
  it.each([
    ['the visitor closes the port picker', domError('NotFoundError'), 'noPort'],
    ['the visitor denies the permission', domError('SecurityError'), 'noPort'],
    ['another program holds the port', domError('InvalidStateError'), 'portBusy'],
    ['the system refuses to open the port', domError('NetworkError'), 'portBusy'],
    ['the board does not sync', new Error('Failed to connect with the device'), 'noAnswer'],
    ['the chip is not recognised', new Error('Unexpected chip magic'), 'noAnswer'],
  ])('maps a connect that fails because %s to %s', async (_cause, error, kind) => {
    const flasher = fakeFlasher({ failAt: { connect: error } });
    const session = createSession({ flasher, manifest, sketch: 'servo' });
    const states = record(session);

    await session.send({ type: 'connect' });

    expect(states).toEqual([{ kind: 'connecting' }, { kind }]);
    expect(flasher.calls).toEqual(['connect', 'disconnect']);
  });

  it('names the chip and the chips that have an image when the board has none', async () => {
    const flasher = fakeFlasher({ chip: 'ESP32-S3' });
    const session = createSession({ flasher, manifest, sketch: 'web-relay' });

    await session.send({ type: 'connect' });

    expect(session.state).toEqual({ kind: 'noImage', chip: 'ESP32-S3', available: ['ESP32', 'ESP8266'] });
    expect(flasher.calls).toEqual(['connect', 'disconnect']);
  });

  it('fetches the image after the chip matches and before flashing, and reports a failed download as noDownload', async () => {
    const flasher = fakeFlasher({ failAt: { load: new DownloadError('Could not download servo.ino.bin: the server answered 404') } });
    const session = createSession({ flasher, manifest, sketch: 'servo' });
    const states = record(session);

    await session.send({ type: 'connect' });

    expect(states).toEqual([{ kind: 'connecting' }, { kind: 'noDownload' }]);
    expect(flasher.calls).toEqual(['connect', 'load', 'disconnect']);
  });

  it('fetches the image only after the settings step', async () => {
    const flasher = fakeFlasher({ failAt: { load: new DownloadError('offline') } });
    const session = createSession({ flasher, manifest, sketch: 'web-relay', baud: 115200 });
    const states = record(session);

    await session.send({ type: 'connect' });

    expect(session.state).toEqual({ kind: 'settings', chip: 'ESP32' });
    expect(flasher.calls).toEqual(['connect']);

    await session.send({ type: 'submitSettings', values: DEFAULTS });

    expect(states.slice(-2)).toEqual([{ kind: 'flashing', chip: 'ESP32', pct: 0 }, { kind: 'noDownload' }]);

    expect(session.state).toEqual({ kind: 'noDownload' });
    expect(flasher.calls).toEqual(['connect', 'load', 'disconnect']);
  });

  it('reports a failed fetch that is not a DownloadError as a drop at 0', async () => {
    const session = createSession({
      flasher: fakeFlasher({ failAt: { load: new Error('boom') } }),
      manifest,
      sketch: 'servo',
    });

    await session.send({ type: 'connect' });

    expect(session.state).toEqual({ kind: 'dropped', pct: 0 });
  });

  it('logs the error behind a failure', async () => {
    const failure = new Error('Failed to connect with the device');
    const session = createSession({ flasher: fakeFlasher({ failAt: { connect: failure } }), manifest, sketch: 'servo' });

    await session.send({ type: 'connect' });

    expect(console.error).toHaveBeenCalledWith(failure);
  });

  it('ignores connect, submitSettings and retry during a flash', async () => {
    let finish!: () => void;
    const flasher = fakeFlasher({ writeGate: new Promise<void>((resolve) => (finish = resolve)) });
    const session = createSession({ flasher, manifest, sketch: 'servo' });
    const flashing = session.send({ type: 'connect' });
    await vi.waitFor(() => expect(session.state.kind).toBe('flashing'));

    await session.send({ type: 'connect' });
    await session.send({ type: 'submitSettings', values: {} });
    await session.send({ type: 'retry' });

    expect(session.state).toEqual({ kind: 'flashing', chip: 'ESP32', pct: 0 });
    expect(flasher.calls).toEqual(['connect', 'load', 'write 4096,65536']);

    finish();
    await flashing;

    expect(session.state).toEqual({ kind: 'running', chip: 'ESP32', output: [] });
  });

  it('ignores retry while idle', async () => {
    const flasher = fakeFlasher();
    const session = createSession({ flasher, manifest, sketch: 'servo' });
    const states = record(session);

    await session.send({ type: 'retry' });

    expect(states).toEqual([]);
    expect(flasher.calls).toEqual([]);
  });

  it('ignores retry while connecting', async () => {
    let finish!: () => void;
    const flasher = fakeFlasher({ progress: [] });
    const connect = flasher.connect.bind(flasher);
    flasher.connect = async () => {
      await new Promise<void>((resolve) => (finish = resolve));
      return connect();
    };
    const session = createSession({ flasher, manifest, sketch: 'servo' });
    const connecting = session.send({ type: 'connect' });

    await session.send({ type: 'retry' });

    expect(session.state).toEqual({ kind: 'connecting' });
    expect(flasher.calls).toEqual([]);
    finish();
    await connecting;
  });

  it('reports the last progress when the write fails', async () => {
    const flasher = fakeFlasher({ progress: [10, 42], failAt: { write: domError('NetworkError') } });
    const session = createSession({ flasher, manifest, sketch: 'servo' });

    await session.send({ type: 'connect' });

    expect(session.state).toEqual({ kind: 'dropped', pct: 42 });
    expect(flasher.calls).toEqual(['connect', 'load', 'write 4096,65536', 'disconnect']);
  });

  it('reports a drop at 0 when the write fails before any progress', async () => {
    const session = createSession({
      flasher: fakeFlasher({ progress: [], failAt: { write: new Error('Could not load part: 404') } }),
      manifest,
      sketch: 'servo',
    });

    await session.send({ type: 'connect' });

    expect(session.state).toEqual({ kind: 'dropped', pct: 0 });
  });

  it('reports a drop when the board cannot be reset after the write', async () => {
    const flasher = fakeFlasher({ failAt: { reset: new Error('port lost') } });
    const session = createSession({ flasher, manifest, sketch: 'servo' });

    await session.send({ type: 'connect' });

    expect(session.state).toEqual({ kind: 'dropped', pct: 100 });
  });

  it.each([
    ['noPort', { connect: domError('NotFoundError') }],
    ['portBusy', { connect: domError('InvalidStateError') }],
    ['noAnswer', { connect: new Error('no sync') }],
    ['noDownload', { load: new DownloadError('404') }],
    ['dropped', { write: new Error('lost') }],
  ] as const)('returns from %s to idle on retry', async (kind, failAt) => {
    const flasher = fakeFlasher({ failAt });
    const session = createSession({ flasher, manifest, sketch: 'servo' });
    await session.send({ type: 'connect' });
    expect(session.state.kind).toBe(kind);

    await session.send({ type: 'retry' });

    expect(session.state).toEqual({ kind: 'idle' });
    expect(flasher.calls.at(-1)).toBe('disconnect');
  });

  it('returns from noImage to idle on retry', async () => {
    const flasher = fakeFlasher({ chip: 'ESP32-S3' });
    const session = createSession({ flasher, manifest, sketch: 'servo' });
    await session.send({ type: 'connect' });
    expect(session.state.kind).toBe('noImage');

    await session.send({ type: 'retry' });

    expect(session.state).toEqual({ kind: 'idle' });
    expect(flasher.calls.at(-1)).toBe('disconnect');
  });

  it.each([
    ['noPort', { failAt: { connect: domError('NotFoundError') } }],
    ['noAnswer', { failAt: { connect: new Error('no sync') } }],
    ['noImage', { chip: 'ESP32-S3' }],
    ['noDownload', { failAt: { load: new DownloadError('404') } }],
    ['dropped', { failAt: { write: new Error('lost') } }],
  ] as [string, FakeFlasherOptions][])('connects again straight from %s', async (kind, options) => {
    const flasher = fakeFlasher(options);
    const session = createSession({ flasher, manifest, sketch: 'servo' });
    await session.send({ type: 'connect' });
    expect(session.state.kind).toBe(kind);
    const states = record(session);

    await session.send({ type: 'connect' });

    expect(states[0]).toEqual({ kind: 'connecting' });
    expect(flasher.calls.filter((call) => call === 'connect')).toHaveLength(2);
  });
});

describe('a session with a baud rate', () => {
  async function running(baud = 9600) {
    const flasher = fakeFlasher();
    const session = createSession({ flasher, manifest, sketch: 'servo', baud });
    const states = record(session);
    await session.send({ type: 'connect' });
    return { flasher, session, states };
  }

  it('reads the board at that baud rate once it is reset, and shows no output yet', async () => {
    const { flasher, session } = await running(115200);

    expect(flasher.calls).toEqual(['connect', 'load', 'write 4096,65536', 'reset', 'monitor 115200']);
    expect(session.state).toEqual({ kind: 'running', chip: 'ESP32', output: [] });
  });

  it('puts the lines the board prints in the running state', async () => {
    const { flasher, session } = await running();

    flasher.print('HIGH');
    flasher.print('LOW', 'HIGH');

    expect(session.state).toEqual({ kind: 'running', chip: 'ESP32', output: ['HIGH', 'LOW', 'HIGH'] });
  });

  it('keeps the last 6 lines', async () => {
    const { flasher, session } = await running();

    flasher.print('1', '2', '3', '4');
    flasher.print('5', '6', '7', '8');

    expect(session.state).toMatchObject({ output: ['3', '4', '5', '6', '7', '8'] });
  });

  it('stops showing lines once the session leaves running', async () => {
    const { flasher, session, states } = await running();
    await session.send({ type: 'disconnect' });
    const entered = states.length;

    flasher.print('late');

    expect(session.state).toEqual({ kind: 'idle', released: true });
    expect(states).toHaveLength(entered);
  });

  it('starts with no lines when the board is flashed again', async () => {
    const { flasher, session } = await running();
    flasher.print('old');
    await session.send({ type: 'disconnect' });

    await session.send({ type: 'connect' });

    expect(session.state).toEqual({ kind: 'running', chip: 'ESP32', output: [] });
    expect(flasher.calls.filter((call) => call === 'monitor 9600')).toHaveLength(2);
  });

  it('marks the board lost, keeping its lines, when the monitor ends', async () => {
    const { flasher, session } = await running();
    flasher.print('HIGH');

    flasher.endMonitor();

    await vi.waitFor(() => expect(session.state).toEqual({ kind: 'running', chip: 'ESP32', output: ['HIGH'], lost: true }));
  });

  it('logs a monitor that fails, and marks the board lost', async () => {
    const { flasher, session } = await running();
    const failure = new Error('port lost');

    flasher.endMonitor(failure);

    await vi.waitFor(() => expect(session.state).toMatchObject({ kind: 'running', lost: true }));
    expect(console.error).toHaveBeenCalledWith(failure);
  });

  it('does not mark the board lost when the visitor disconnected it', async () => {
    const { flasher, session, states } = await running();
    await session.send({ type: 'disconnect' });
    const entered = states.length;

    flasher.endMonitor();
    await Promise.resolve();
    await Promise.resolve();

    expect(session.state).toEqual({ kind: 'idle', released: true });
    expect(states).toHaveLength(entered);
  });

  it('connects again from a lost board: releases the port, then flashes with no old lines', async () => {
    const { flasher, session } = await running();
    flasher.print('old');
    flasher.endMonitor();
    await vi.waitFor(() => expect(session.state).toMatchObject({ lost: true }));

    await session.send({ type: 'connect' });

    expect(session.state).toEqual({ kind: 'running', chip: 'ESP32', output: [] });
    expect(flasher.calls.slice(-7)).toEqual([
      'monitor 9600',
      'disconnect',
      'connect',
      'load',
      'write 4096,65536',
      'reset',
      'monitor 9600',
    ]);
  });

  it('ignores the end of an old monitor once the board is flashed again', async () => {
    const { flasher, session } = await running();
    flasher.endMonitor();
    await vi.waitFor(() => expect(session.state).toMatchObject({ lost: true }));
    await session.send({ type: 'connect' });

    flasher.print('new');

    expect(session.state).toEqual({ kind: 'running', chip: 'ESP32', output: ['new'] });
  });
});

describe('a session without a baud rate', () => {
  it('starts no monitor', async () => {
    const flasher = fakeFlasher();
    const session = createSession({ flasher, manifest, sketch: 'servo' });

    await session.send({ type: 'connect' });

    expect(flasher.calls).toEqual(['connect', 'load', 'write 4096,65536', 'reset']);
  });
});
