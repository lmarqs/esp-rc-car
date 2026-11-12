import type { Flasher } from './flasher';
import { imageFor, isMissing, type ChipFamily, type Manifest, type ManifestImage } from './manifest';

export type SessionState =
  | { kind: 'unsupported' }
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'settings'; chip: string }
  | { kind: 'flashing'; chip: string; pct: number }
  | { kind: 'running'; chip: string }
  | { kind: 'noPort' }
  | { kind: 'portBusy' }
  | { kind: 'noAnswer' }
  | { kind: 'noImage'; chip: string; available: ChipFamily[] }
  | { kind: 'dropped'; pct: number };

export type SessionEvent =
  /** From `idle` or a failure: asks for a port and connects to the board. */
  | { type: 'connect' }
  /** From `settings`: flashes the board. */
  | { type: 'startFlash' }
  /** From a failure, `settings` or `running`: releases the port and returns to `idle`. */
  | { type: 'retry' };

export interface SessionOptions {
  /** The flasher to use, or `null` in a browser that cannot reach a USB board. */
  flasher: Flasher | null;
  manifest: Manifest;
  sketch: string;
}

export interface FlashSession {
  readonly state: SessionState;
  /** Calls `listener` with every state the session enters, and returns a function that stops it. */
  subscribe(listener: (state: SessionState) => void): () => void;
  /** Resolves once the event's work has settled: a state that waits for the next event, or a failure. */
  send(event: SessionEvent): Promise<void>;
}

type Failure = Extract<SessionState['kind'], 'noPort' | 'portBusy' | 'noAnswer'>;

const FAILURE_KINDS: ReadonlySet<SessionState['kind']> = new Set([
  'noPort',
  'portBusy',
  'noAnswer',
  'noImage',
  'dropped',
]);

/**
 * Web Serial rejects `requestPort` with `NotFoundError` when the visitor closes the picker and `SecurityError` when
 * they deny the permission, and `open` with `InvalidStateError` when the port is already open or `NetworkError` when
 * the system refuses it. Anything else that
 * stops the connection, such as esptool-js failing to sync with the ROM bootloader, means the board stayed silent.
 */
function connectFailure(error: unknown): Failure {
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
  if (name === 'NotFoundError' || name === 'SecurityError') {
    return 'noPort';
  }
  if (name === 'InvalidStateError' || name === 'NetworkError') {
    return 'portBusy';
  }
  return 'noAnswer';
}

export function createSession({ flasher, manifest, sketch }: SessionOptions): FlashSession {
  const listeners = new Set<(state: SessionState) => void>();
  let state: SessionState = flasher ? { kind: 'idle' } : { kind: 'unsupported' };
  let image: ManifestImage | undefined;
  let lastPct = 0;

  function enter(next: SessionState) {
    state = next;
    listeners.forEach((listener) => listener(next));
  }

  async function connect(active: Flasher) {
    enter({ kind: 'connecting' });
    let chip: string;
    try {
      chip = await active.connect();
    } catch (error) {
      await active.disconnect();
      enter({ kind: connectFailure(error) });
      return;
    }

    const found = imageFor(manifest, sketch, chip);
    if (isMissing(found)) {
      await active.disconnect();
      enter({ kind: 'noImage', chip, available: found.available });
      return;
    }
    image = found;

    if (manifest.sketches[sketch]?.settings?.length) {
      enter({ kind: 'settings', chip });
      return;
    }
    await flash(active, chip);
  }

  async function flash(active: Flasher, chip: string) {
    lastPct = 0;
    enter({ kind: 'flashing', chip, pct: 0 });
    try {
      await active.write(image!.parts, (pct) => {
        const clamped = Math.min(100, Math.max(0, Math.floor(pct)));
        if (clamped > lastPct) {
          lastPct = clamped;
          enter({ kind: 'flashing', chip, pct: clamped });
        }
      });
      await active.reset();
    } catch {
      await active.disconnect();
      enter({ kind: 'dropped', pct: lastPct });
      return;
    }
    enter({ kind: 'running', chip });
  }

  async function release(active: Flasher) {
    await active.disconnect();
    enter({ kind: 'idle' });
  }

  return {
    get state() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async send(event) {
      if (!flasher) {
        return;
      }
      const { kind } = state;
      switch (event.type) {
        case 'connect':
          if (kind === 'idle' || FAILURE_KINDS.has(kind)) {
            await connect(flasher);
          }
          break;
        case 'startFlash':
          if (state.kind === 'settings') {
            await flash(flasher, state.chip);
          }
          break;
        case 'retry':
          if (kind === 'settings' || kind === 'running' || FAILURE_KINDS.has(kind)) {
            await release(flasher);
          }
          break;
      }
    },
  };
}
