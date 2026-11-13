import { describe, expect, it } from 'vitest';
import { chipLevel, flashScene } from '../../src/lib/board/flashScene';
import { boardModel } from '../../src/lib/board/models';

const esp01s = boardModel('esp01s');
const esp32 = boardModel('esp32');

describe('the flash picture', () => {
  it('draws the cable loose and the board faint before a board is connected', () => {
    expect(flashScene({ kind: 'idle' })).toEqual({ cable: 'loose', chip: 'faint', steps: ['todo', 'todo', 'todo'] });
  });

  it('sends a ping down the cable to a chip it does not know yet while it looks for the board', () => {
    expect(flashScene({ kind: 'connecting' })).toEqual({ cable: 'ping', chip: 'unknown', steps: ['now', 'todo', 'todo'] });
  });

  it('runs the image down the cable and fills the chip while it writes, reporting the percentage', () => {
    expect(flashScene({ kind: 'flashing', chip: 'ESP32', pct: 40 })).toEqual({
      cable: 'packets',
      chip: 'known',
      fill: { pct: 40, tone: 'writing' },
      steps: ['done', 'now', 'todo'],
      pct: 40,
    });
  });

  it('restarts the board once the chip is full', () => {
    expect(flashScene({ kind: 'flashing', chip: 'ESP32', pct: 100 })).toMatchObject({
      cable: 'joined',
      fill: { pct: 100, tone: 'written' },
      steps: ['done', 'done', 'now'],
    });
  });

  it('marks where a failure happened: the computer, the cable or the board', () => {
    expect(flashScene({ kind: 'noPort' })).toMatchObject({ broken: 'computer', steps: ['failed', 'todo', 'todo'] });
    expect(flashScene({ kind: 'portBusy' })).toMatchObject({ broken: 'computer' });
    expect(flashScene({ kind: 'noDownload' })).toMatchObject({ broken: 'computer', steps: ['done', 'failed', 'todo'] });
    expect(flashScene({ kind: 'noAnswer' })).toMatchObject({ broken: 'chip', chip: 'unknown' });
    expect(flashScene({ kind: 'noImage', chip: 'ESP8266', available: ['ESP32'] })).toMatchObject({ broken: 'chip' });
    expect(flashScene({ kind: 'running', chip: 'ESP32', output: [], lost: true })).toMatchObject({ broken: 'cable' });
  });

  it('keeps what a dropped write reached in the chip', () => {
    expect(flashScene({ kind: 'dropped', pct: 43 })).toMatchObject({
      cable: 'broken',
      broken: 'cable',
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
      cable: 'joined',
      chip: 'known',
      fill: { pct: 100, tone: 'waiting' },
      steps: ['done', 'done', 'failed'],
      hint: 'uart',
    });
  });

  it('reports no progress outside a write', () => {
    expect(flashScene({ kind: 'running', chip: 'ESP32', output: [] }).pct).toBeUndefined();
    expect(flashScene({ kind: 'dropped', pct: 43 }).pct).toBeUndefined();
  });

  it('fills the chip from its floor, empty at 0% and to its top at 100%, never past either', () => {
    expect(chipLevel(0)).toEqual({ y: 52, height: 0 });
    expect(chipLevel(50)).toEqual({ y: 30, height: 22 });
    expect(chipLevel(100)).toEqual({ y: 8, height: 44 });
    expect(chipLevel(140)).toEqual(chipLevel(100));
    expect(chipLevel(-5)).toEqual(chipLevel(0));
  });
});
