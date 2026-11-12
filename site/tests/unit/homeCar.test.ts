import { describe, expect, it } from 'vitest';
import { PARKED, stepCar, tiltStick, type Car, type Drive } from '../../src/components/examples/homeCar';

const IDLE: Drive = { steer: 0, jump: false };
const RIGHT: Drive = { steer: 1, jump: false };
const JUMP: Drive = { steer: 0, jump: true };

function run(car: Car, drives: Drive[], still = false, start = 0): Car[] {
  const frames: Car[] = [];
  drives.forEach((drive, i) => {
    car = stepCar(car, drive, still, start + i * 16);
    frames.push(car);
  });
  return frames;
}
const hold = (drive: Drive, frames: number) => Array.from({ length: frames }, () => drive);

describe('tiltStick', () => {
  it('turns a drag of 7 to the right into half steer to the right', () => {
    expect(tiltStick(7, 0)).toEqual({ dx: 7, dy: 0, steer: 0.5, lift: 0 });
  });

  it('holds a drag of 28 to the right at the stick reach of 14', () => {
    expect(tiltStick(28, 0)).toEqual({ dx: 14, dy: 0, steer: 1, lift: 0 });
  });

  it('reads a drag of 14 upwards as a full lift', () => {
    expect(tiltStick(0, -14).lift).toBe(1);
  });
});

describe('stepCar', () => {
  it('stays parked when nothing is pressed', () => {
    expect(stepCar(PARKED, IDLE, false, 0)).toEqual(PARKED);
  });

  it('holding right for 2 seconds drives the car to its right end at x = 120', () => {
    const last = run(PARKED, hold(RIGHT, 120)).at(-1)!;
    expect(last.x).toBe(120);
  });

  it('holding right for 2 seconds with reduced motion also reaches x = 120, at full speed from the first frame', () => {
    const [first] = run(PARKED, hold(RIGHT, 1), true);
    expect(first.vx).toBe(5);
  });

  it('a jump leaves the ground, comes back, and squashes the car on the frame it lands', () => {
    const frames = run(PARKED, [JUMP, ...hold(IDLE, 60)]);
    const landing = frames.findIndex((car, i) => i > 0 && car.y === 0 && frames[i - 1].y < 0);

    expect(Math.min(...frames.map((car) => car.y))).toBeLessThan(-50);
    expect(frames[landing].squash).toBeGreaterThan(0.7);
  });

  it('with reduced motion a jump shows the car 40 up for 350 ms, then back on the ground, without a squash', () => {
    const lifted = stepCar(PARKED, JUMP, true, 1000);
    const during = stepCar(lifted, IDLE, true, 1300);
    const after = stepCar(during, IDLE, true, 1360);

    expect([lifted.y, during.y, after.y]).toEqual([-40, -40, 0]);
    expect(after.squash).toBe(0);
  });

  it('pushes the loose wheel once the car is at its right end, and lets it roll back once the car backs off', () => {
    const atEnd = run(PARKED, hold(RIGHT, 120)).at(-1)!;
    const backedOff = run({ ...atEnd, x: 0, vx: 0 }, hold(IDLE, 120)).at(-1)!;

    expect(atEnd.push).toBe(48);
    expect(backedOff.push).toBeLessThan(1);
  });
});
