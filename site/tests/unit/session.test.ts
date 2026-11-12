import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadError, type Flasher } from '../../src/lib/flash/flasher';
import type { Manifest } from '../../src/lib/flash/manifest';
import { createSession, type SessionState } from '../../src/lib/flash/session';

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
      settings: [{ key: 'ssid' }],
    },
  },
};

interface FakeFlasher extends Flasher {
  calls: string[];
  /** Prints lines on the monitor that the session started; fails the test when there is none. */
  print(...lines: string[]): void;
}

interface FakeFlasherOptions {
  chip?: string;
  progress?: number[];
  failAt?: Partial<Record<'connect' | 'load' | 'write' | 'reset', unknown>>;
  /** The write waits for this before it reports progress. */
  writeGate?: Promise<void>;
}

/** A flasher that connects to `chip`, writes by reporting each of `progress`, and fails where `failAt` says. */
function fakeFlasher(options: FakeFlasherOptions = {}): FakeFlasher {
  const { chip = 'ESP32', progress = [10, 50, 100], failAt = {}, writeGate } = options;
  const calls: string[] = [];
  let onLines: ((lines: string[]) => void) | undefined;
  return {
    calls,
    print(...lines) {
      onLines!(lines);
    },
    async monitor(baud, listener) {
      calls.push(`monitor ${baud}`);
      onLines = listener;
      await new Promise<void>(() => {});
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

    expect(session.state).toEqual({ kind: 'idle' });
    expect(flasher.calls.at(-1)).toBe('disconnect');
  });

  it('ignores disconnect outside running', async () => {
    const flasher = fakeFlasher();
    const session = createSession({ flasher, manifest, sketch: 'servo' });

    await session.send({ type: 'disconnect' });

    expect(session.state).toEqual({ kind: 'idle' });
    expect(flasher.calls).toEqual([]);
  });

  it('ignores startFlash outside settings', async () => {
    const flasher = fakeFlasher();
    const session = createSession({ flasher, manifest, sketch: 'servo' });

    await session.send({ type: 'startFlash' });

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
  it('waits in settings after connecting, and flashes on startFlash', async () => {
    const flasher = fakeFlasher();
    const session = createSession({ flasher, manifest, sketch: 'web-relay' });
    const states = record(session);

    await session.send({ type: 'connect' });

    expect(session.state).toEqual({ kind: 'settings', chip: 'ESP32' });
    expect(flasher.calls).toEqual(['connect']);

    await session.send({ type: 'startFlash' });

    expect(states.map((state) => state.kind)).toEqual([
      'connecting',
      'settings',
      'flashing',
      'flashing',
      'flashing',
      'flashing',
      'running',
    ]);
    expect(flasher.calls).toEqual(['connect', 'load', 'write 4096,65536', 'reset']);
  });

  it('writes the parts of the image built for the chip it found', async () => {
    const flasher = fakeFlasher({ chip: 'ESP8266' });
    const session = createSession({ flasher, manifest, sketch: 'web-relay' });

    await session.send({ type: 'connect' });
    await session.send({ type: 'startFlash' });

    expect(flasher.calls).toContain('write 0');
  });

  it('releases the port and returns to idle on retry from settings', async () => {
    const flasher = fakeFlasher();
    const session = createSession({ flasher, manifest, sketch: 'web-relay' });
    await session.send({ type: 'connect' });

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
    const session = createSession({ flasher, manifest, sketch: 'web-relay' });

    await session.send({ type: 'connect' });

    expect(session.state).toEqual({ kind: 'settings', chip: 'ESP32' });
    expect(flasher.calls).toEqual(['connect']);

    await session.send({ type: 'startFlash' });

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

  it('ignores connect, startFlash and retry during a flash', async () => {
    let finish!: () => void;
    const flasher = fakeFlasher({ writeGate: new Promise<void>((resolve) => (finish = resolve)) });
    const session = createSession({ flasher, manifest, sketch: 'servo' });
    const flashing = session.send({ type: 'connect' });
    await vi.waitFor(() => expect(session.state.kind).toBe('flashing'));

    await session.send({ type: 'connect' });
    await session.send({ type: 'startFlash' });
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

    expect(session.state).toEqual({ kind: 'idle' });
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

  it('logs a monitor that fails and stays running', async () => {
    const failure = new Error('port lost');
    const flasher = { ...fakeFlasher(), monitor: async () => Promise.reject(failure) };
    const session = createSession({ flasher, manifest, sketch: 'servo', baud: 9600 });

    await session.send({ type: 'connect' });

    await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith(failure));
    expect(session.state.kind).toBe('running');
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
