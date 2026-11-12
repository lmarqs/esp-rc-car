import { describe, expect, it } from 'vitest';
import { BOARD_MODELS, boardModel, correctionNotice, modelAnswering, modelsWithImages } from '../../src/lib/board/models';
import { createPick, type PickStorage } from '../../src/lib/board/pick';

function memoryStorage(start: Record<string, string> = {}): PickStorage & { values: Record<string, string> } {
  const values = { ...start };
  return {
    values,
    getItem: (key) => (Object.hasOwn(values, key) ? values[key]! : null),
    setItem: (key, value) => {
      values[key] = value;
    },
    removeItem: (key) => {
      delete values[key];
    },
  };
}

describe('the board models', () => {
  it('finds a model by its id, and nothing for an id outside the list', () => {
    expect(boardModel('esp01s')?.name).toBe('ESP-01S');
    expect(boardModel('constructor')).toBeUndefined();
  });

  it('keeps the pick when its chip answers', () => {
    expect(modelAnswering(boardModel('esp01s'), 'ESP8266')?.id).toBe('esp01s');
  });

  it('follows the chip that answers when it is not the picked one', () => {
    expect(modelAnswering(boardModel('esp01s'), 'ESP32')?.id).toBe('esp32');
    expect(modelAnswering(undefined, 'ESP32-C3')?.id).toBe('esp32c3');
  });

  it('keeps the pick for a chip the list does not know', () => {
    expect(modelAnswering(boardModel('esp32'), 'ESP32-S3')?.id).toBe('esp32');
  });

  it('lists the models whose chip has an image, in the list order', () => {
    expect(modelsWithImages(['ESP8266', 'ESP32']).map((model) => model.id)).toEqual(['esp32', 'esp01s']);
    expect(modelsWithImages([])).toEqual([]);
  });

  it('says which board answered instead of the picked one', () => {
    expect(correctionNotice(boardModel('esp01s')!, boardModel('esp32')!)).toBe(
      'You picked an ESP-01S, but an ESP32 answered. The site now follows the ESP32 dev board.',
    );
  });

  it('has one model per chip, so a chip names its model', () => {
    const chips = BOARD_MODELS.map((model) => model.chip);
    expect(new Set(chips).size).toBe(chips.length);
  });
});

describe('the board pick', () => {
  it('starts from what the browser kept', () => {
    expect(createPick(memoryStorage({ 'robomania.board': 'esp01s' })).model?.id).toBe('esp01s');
  });

  it('starts with no pick from an unknown id or none', () => {
    expect(createPick(memoryStorage({ 'robomania.board': 'digispark' })).model).toBeUndefined();
    expect(createPick(memoryStorage()).model).toBeUndefined();
  });

  it('keeps a choice and tells its listeners', () => {
    const storage = memoryStorage();
    const pick = createPick(storage);
    const seen: (string | undefined)[] = [];
    pick.subscribe(() => seen.push(pick.model?.id));
    pick.choose('esp32');
    pick.choose(undefined);
    expect(seen).toEqual(['esp32', undefined]);
    expect(storage.values).toEqual({});
  });

  it('tells no one when the choice does not change', () => {
    const pick = createPick(memoryStorage({ 'robomania.board': 'esp32' }));
    let calls = 0;
    pick.subscribe(() => calls++);
    pick.choose('esp32');
    expect(calls).toBe(0);
  });

  it('still works when the browser refuses to keep it', () => {
    const refusing: PickStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const pick = createPick(refusing);
    pick.choose('esp01s');
    expect(pick.model?.id).toBe('esp01s');
  });
});
