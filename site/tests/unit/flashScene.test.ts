import { describe, expect, it } from 'vitest';
import { flashScene } from '../../src/lib/board/flashScene';
import { boardModel } from '../../src/lib/board/models';

const esp01s = boardModel('esp01s');
const esp32 = boardModel('esp32');

describe('the flash rail', () => {
  it('marks no step before a board is connected', () => {
    expect(flashScene({ kind: 'idle' })).toEqual({ steps: ['todo', 'todo', 'todo'] });
  });

  it('is on Find while it looks for the board', () => {
    expect(flashScene({ kind: 'connecting' })).toEqual({ steps: ['now', 'todo', 'todo'] });
  });

  it('is on Write while the image goes down, reporting the percentage', () => {
    expect(flashScene({ kind: 'flashing', chip: 'ESP32', pct: 40 })).toEqual({
      fill: { pct: 40, tone: 'writing' },
      steps: ['done', 'now', 'todo'],
      pct: 40,
    });
  });

  it('restarts the board once everything is written', () => {
    expect(flashScene({ kind: 'flashing', chip: 'ESP32', pct: 100 })).toMatchObject({
      fill: { pct: 100, tone: 'written' },
      steps: ['done', 'done', 'now'],
    });
  });

  it('marks the step where a failure happened', () => {
    expect(flashScene({ kind: 'noPort' }).steps).toEqual(['failed', 'todo', 'todo']);
    expect(flashScene({ kind: 'portBusy' }).steps).toEqual(['failed', 'todo', 'todo']);
    expect(flashScene({ kind: 'noAnswer' }).steps).toEqual(['failed', 'todo', 'todo']);
    expect(flashScene({ kind: 'noDownload' }).steps).toEqual(['done', 'failed', 'todo']);
    expect(flashScene({ kind: 'noImage', chip: 'ESP8266', available: ['ESP32'] }).steps).toEqual(['done', 'failed', 'todo']);
  });

  it('marks Find as failed for a board that was running and is lost, and marks nothing while it runs', () => {
    expect(flashScene({ kind: 'running', chip: 'ESP32', output: [], lost: true }).steps).toEqual(['failed', 'todo', 'todo']);
    expect(flashScene({ kind: 'running', chip: 'ESP32', output: [] }).steps).toEqual(['todo', 'todo', 'todo']);
  });

  it('keeps what a dropped write reached', () => {
    expect(flashScene({ kind: 'dropped', pct: 43 })).toEqual({
      fill: { pct: 43, tone: 'failed' },
      steps: ['done', 'failed', 'todo'],
    });
  });

  it('draws the hands-on step for the picked board when it does not answer: its BOOT button or its switch to PROG', () => {
    expect(flashScene({ kind: 'noAnswer' }, esp32).hint).toBe('boot');
    expect(flashScene({ kind: 'noAnswer' }).hint).toBe('boot');
    expect(flashScene({ kind: 'noAnswer' }, esp01s).hint).toBe('prog');
  });

  it('shows a board still in flash mode as written but not started, with its switch to UART', () => {
    expect(flashScene({ kind: 'flashMode', chip: 'ESP8266' })).toEqual({
      fill: { pct: 100, tone: 'waiting' },
      steps: ['done', 'done', 'failed'],
      hint: 'uart',
    });
  });

  it('reports no progress outside a write', () => {
    expect(flashScene({ kind: 'running', chip: 'ESP32', output: [] }).pct).toBeUndefined();
    expect(flashScene({ kind: 'dropped', pct: 43 }).pct).toBeUndefined();
  });
});
