import { describe, expect, it } from 'vitest';
import balanceBeam from '../../../sketches/balance-beam/settings.json';
import webRelay from '../../../sketches/web-relay/settings.json';
import fixture from '../e2e/fixtures/firmware-manifest.json';
import type { Manifest, SettingField } from '../../src/lib/flash/manifest';
import {
  changedValues,
  defaultValues,
  NO_ANSWER,
  parseCfgLine,
  refusalText,
  sendOrder,
  settingsOf,
  validate,
} from '../../src/lib/flash/settings';

const beam = balanceBeam as SettingField[];
const relay = webRelay as SettingField[];
const field = (key: string) => beam.find((candidate) => candidate.key === key)!;

const BEAM_BOARD = {
  ap_ssid: 'balance-beam',
  ap_password: 'unset',
  angle_offset_deg: '0',
  throttle_min: '0',
  throttle_mid: '0',
  throttle_max: '0',
  tilt_limit_deg: '45',
};

describe('the sketches settings.json', () => {
  it('give each field a known type, and every default passes its own limits', () => {
    for (const fields of [beam, relay]) {
      for (const { type } of fields) {
        expect(['text', 'password', 'number']).toContain(type);
      }
      expect(validate(fields, defaultValues(fields))).toEqual({});
    }
  });

  it('are what the browser tests flash balance-beam with', () => {
    expect(fixture.sketches['balance-beam'].settings).toEqual(beam);
  });
});

describe('settingsOf', () => {
  const manifest: Manifest = { sketches: { beam: { images: [], settings: beam }, blink: { images: [] } } };

  it('gives the fields of a sketch that prints at a baud', () => {
    expect(settingsOf(manifest, 'beam', 115200)).toBe(beam);
  });

  it('gives none to a sketch with no settings or no baud', () => {
    expect(settingsOf(manifest, 'blink', 115200)).toEqual([]);
    expect(settingsOf(manifest, 'beam', undefined)).toEqual([]);
  });
});

describe('defaultValues', () => {
  it('gives each default as text', () => {
    expect(defaultValues(beam)).toEqual({
      ap_ssid: 'balance-beam',
      ap_password: 'thebalancebot',
      angle_offset_deg: '0',
      throttle_min: '0',
      throttle_mid: '0',
      throttle_max: '0',
      tilt_limit_deg: '45',
    });
  });
});

describe('validate', () => {
  const values = defaultValues(beam);

  it('refuses a text outside its length, counting bytes as the board does', () => {
    expect(validate(beam, { ...values, ap_ssid: '' })).toEqual({ ap_ssid: 'Use 1 to 32 characters.' });
    expect(validate(beam, { ...values, ap_ssid: 'é'.repeat(17) })).toEqual({ ap_ssid: 'Use 1 to 32 characters.' });
    expect(validate(beam, { ...values, ap_ssid: 'x'.repeat(32) })).toEqual({});
  });

  it('refuses a password shorter than 8 or longer than 63 characters', () => {
    expect(validate(beam, { ...values, ap_password: 'short' })).toEqual({ ap_password: 'Use 8 to 63 characters.' });
    expect(validate(beam, { ...values, ap_password: 'x'.repeat(64) })).toEqual({ ap_password: 'Use 8 to 63 characters.' });
  });

  it('refuses a number that is not one or lies outside its range', () => {
    expect(validate(beam, { ...values, angle_offset_deg: 'abc' })).toEqual({ angle_offset_deg: 'Use a number.' });
    expect(validate(beam, { ...values, angle_offset_deg: ' ' })).toEqual({ angle_offset_deg: 'Use a number.' });
    expect(validate(beam, { ...values, angle_offset_deg: '30.5' })).toEqual({
      angle_offset_deg: 'Use a number from -30 to 30.',
    });
    expect(validate(beam, { ...values, tilt_limit_deg: '0' })).toEqual({ tilt_limit_deg: 'Use a number from 1 to 90.' });
  });

  it('names the first field of a group lower than the one before it', () => {
    expect(validate(beam, { ...values, throttle_min: '0.1', throttle_mid: '0.05', throttle_max: '0.01' })).toEqual({
      throttle_mid: 'Use at least the Throttle min.',
    });
    expect(validate(beam, { ...values, throttle_min: '0.08', throttle_mid: '0.085', throttle_max: '0.09' })).toEqual({});
  });

  it('checks no order in a group that has a field already wrong', () => {
    expect(validate(beam, { ...values, throttle_min: '0.5', throttle_mid: 'x' })).toEqual({ throttle_mid: 'Use a number.' });
  });

  it('lists the errors in field order', () => {
    const errors = validate(beam, { ...values, tilt_limit_deg: '100', ap_ssid: '' });

    expect(Object.keys(errors)).toEqual(['ap_ssid', 'tilt_limit_deg']);
  });
});

describe('parseCfgLine', () => {
  it('reads the replies of the protocol', () => {
    expect(parseCfgLine('cfg ok ap_ssid')).toEqual({ kind: 'ok', key: 'ap_ssid' });
    expect(parseCfgLine('cfg err ap_password too short')).toEqual({ kind: 'err', key: 'ap_password', reason: 'too short' });
    expect(parseCfgLine('cfg err - syntax')).toEqual({ kind: 'err', key: '-', reason: 'syntax' });
    expect(parseCfgLine('cfg ap_ssid=my net=1')).toEqual({ kind: 'value', key: 'ap_ssid', value: 'my net=1' });
    expect(parseCfgLine('cfg throttle_min=0.085')).toEqual({ kind: 'value', key: 'throttle_min', value: '0.085' });
    expect(parseCfgLine('cfg end')).toEqual({ kind: 'end' });
  });

  it('reads no other line', () => {
    expect(parseCfgLine('HIGH')).toBeUndefined();
    expect(parseCfgLine('cfg')).toBeUndefined();
  });
});

describe('changedValues', () => {
  it('compares numbers as numbers, since the board prints them with %g', () => {
    const values = { ...defaultValues(beam), throttle_mid: '0.0850', tilt_limit_deg: '45.0' };

    expect(changedValues(beam, values, { ...BEAM_BOARD, throttle_mid: '0.085' })).toEqual({});
  });

  it('sends the values that differ from what the board reported', () => {
    const values = { ...defaultValues(beam), ap_ssid: 'beam-2', tilt_limit_deg: '30' };

    expect(changedValues(beam, values, BEAM_BOARD)).toEqual({ ap_ssid: 'beam-2', tilt_limit_deg: '30' });
  });

  it('sends the defaults the board holds other values for, since flashing keeps what it stored', () => {
    const board = { ...BEAM_BOARD, ap_ssid: 'old-name', throttle_max: '0.09' };

    expect(changedValues(beam, defaultValues(beam), board)).toEqual({ ap_ssid: 'balance-beam', throttle_max: '0' });
  });

  it('sends no password the board does not store while the form holds its default', () => {
    const board = { ap_ssid: 'web-relay', ap_password: 'unset', ota_password: 'unset' };

    expect(changedValues(relay, defaultValues(relay), board)).toEqual({});
  });

  it('sends a password that differs from the default', () => {
    const board = { ap_ssid: 'web-relay', ap_password: 'unset', ota_password: 'unset' };

    expect(changedValues(relay, { ...defaultValues(relay), ota_password: 'another-secret' }, board)).toEqual({
      ota_password: 'another-secret',
    });
  });

  it('sends the default password over one the board stores, which may be another', () => {
    const board = { ap_ssid: 'web-relay', ap_password: 'set', ota_password: 'unset' };

    expect(changedValues(relay, defaultValues(relay), board)).toEqual({ ap_password: 'web-relay-1234' });
  });

  it('sends a value the board did not report', () => {
    const { tilt_limit_deg: _, ...board } = BEAM_BOARD;

    expect(changedValues(beam, defaultValues(beam), board)).toEqual({ tilt_limit_deg: '45' });
  });
});

describe('sendOrder', () => {
  const band = (min: string, mid: string, max: string) => ({
    ...BEAM_BOARD,
    throttle_min: min,
    throttle_mid: mid,
    throttle_max: max,
  });

  it('keeps field order when no group is in the way', () => {
    expect(sendOrder(beam, { tilt_limit_deg: '30', ap_ssid: 'x' }, BEAM_BOARD)).toEqual([
      ['ap_ssid', 'x'],
      ['tilt_limit_deg', '30'],
    ]);
  });

  it('widens a band from zero from the top down', () => {
    const pending = { throttle_min: '0.08', throttle_mid: '0.085', throttle_max: '0.09' };

    expect(sendOrder(beam, pending, band('0', '0', '0'))).toEqual([
      ['throttle_max', '0.09'],
      ['throttle_mid', '0.085'],
      ['throttle_min', '0.08'],
    ]);
  });

  it('brings a band down to zero from the bottom up', () => {
    const pending = { throttle_min: '0', throttle_mid: '0', throttle_max: '0' };

    expect(sendOrder(beam, pending, band('0.08', '0.085', '0.09'))).toEqual([
      ['throttle_min', '0'],
      ['throttle_mid', '0'],
      ['throttle_max', '0'],
    ]);
  });

  it('moves a band past its old one, each step keeping the group ordered', () => {
    const pending = { throttle_min: '0.5', throttle_mid: '0.6', throttle_max: '0.7' };
    const order = sendOrder(beam, pending, band('0.1', '0.2', '0.3'));

    const current: Record<string, string> = band('0.1', '0.2', '0.3');
    for (const [key, value] of order) {
      current[key] = value;
      const [min, mid, max] = ['throttle_min', 'throttle_mid', 'throttle_max'].map((name) => Number(current[name]));
      expect(min! <= mid! && mid! <= max!).toBe(true);
    }
    expect(order.map(([key]) => key)).toEqual(['throttle_max', 'throttle_mid', 'throttle_min']);
  });

  it('sends the first pending one when none keeps the group ordered', () => {
    expect(sendOrder(beam, { throttle_mid: '0.5' }, band('0', '0', '0'))).toEqual([['throttle_mid', '0.5']]);
  });
});

describe('refusalText', () => {
  it('says what to do about each reason the board gives', () => {
    expect(refusalText(field('ap_ssid'), 'length')).toBe('Use 1 to 32 characters.');
    expect(refusalText(field('ap_password'), 'too short')).toBe('Use 8 to 63 characters.');
    expect(refusalText(field('tilt_limit_deg'), 'range')).toBe('Use a number from 1 to 90.');
    expect(refusalText(field('throttle_mid'), 'armed')).toBe('The board is armed. Disarm it, then send the settings again.');
    expect(refusalText(field('throttle_mid'), 'order')).toBe('The board refused it against the other values of its group.');
    expect(refusalText(field('ap_ssid'), NO_ANSWER)).toBe('The board did not answer.');
    expect(refusalText(field('ap_ssid'), 'odd')).toBe('The board refused it: odd.');
  });
});
