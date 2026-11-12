/** What the visitor asks of the car this frame: steer from -1 (full left) to 1 (full right), and whether to jump. */
export interface Drive {
  readonly steer: number;
  readonly jump: boolean;
}

/**
 * The car on the home page's bench, in the scene's SVG units. `x` and `y` offset the car from where it is parked,
 * with `y` negative in the air; `squash` runs from 1 on landing down to 0; `push` is how far the loose wheel has been
 * pushed from its place; `liftedUntil` is when a reduced-motion jump ends.
 */
export interface Car {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly squash: number;
  readonly push: number;
  readonly liftedUntil: number;
}

/** Where the gamepad's knob sits and what it asks for: `steer` and `lift` from -1 to 1, `lift` 1 when pushed up. */
export interface Tilt {
  readonly dx: number;
  readonly dy: number;
  readonly steer: number;
  readonly lift: number;
}

export const PARKED: Car = { x: 0, y: 0, vx: 0, vy: 0, squash: 0, push: 0, liftedUntil: 0 };

const STICK_REACH = 14;
const TOP_SPEED = 5;
const LEFT_END = -150;
const RIGHT_END = 120;
const JUMP_SPEED = -8.5;
const GRAVITY = 0.55;
const STILL_LIFT = -40;
const STILL_LIFT_MS = 350;
// The car's right wheel has its outer edge at 434 + x; the loose wheel, radius 12, rests at 520.
const WHEEL_GAP = 520 - 434 - 14;

/** Clamps a drag of the knob from the stick's centre to the stick's reach. */
export function tiltStick(dx: number, dy: number): Tilt {
  const scale = Math.min(1, STICK_REACH / (Math.hypot(dx, dy) || 1));
  const x = dx * scale;
  const y = dy * scale;
  return { dx: x, dy: y, steer: x / STICK_REACH, lift: -y / STICK_REACH || 0 };
}

/** Advances the car one frame. With `still` (reduced motion) it reaches speed at once and a jump is a brief lift. */
export function stepCar(car: Car, drive: Drive, still: boolean, now: number): Car {
  const vx = car.vx + (drive.steer * TOP_SPEED - car.vx) * (still ? 1 : 0.12);
  const x = Math.max(LEFT_END, Math.min(RIGHT_END, car.x + vx));
  const air = still ? liftStill(car, drive, now) : fly(car, drive);
  // In the air the car leaves the loose wheel where it is, so the wheel neither rolls back under it nor jumps on landing.
  const contact = air.y > -30 ? Math.max(0, x - WHEEL_GAP) : car.push;
  const push = contact > car.push ? contact : car.push + (contact - car.push) * 0.05;
  return { ...car, ...air, x, vx, push };
}

function fly(car: Car, drive: Drive): Pick<Car, 'y' | 'vy' | 'squash'> {
  const launch = drive.jump && car.y === 0 ? JUMP_SPEED : car.vy;
  const vy = launch + GRAVITY;
  const y = Math.min(0, car.y + vy);
  const landed = car.y < 0 && y === 0;
  return { y, vy: y === 0 ? 0 : vy, squash: landed ? 1 : car.squash * 0.8 };
}

function liftStill(car: Car, drive: Drive, now: number): Pick<Car, 'y' | 'vy' | 'squash' | 'liftedUntil'> {
  const liftedUntil = drive.jump && car.y === 0 ? now + STILL_LIFT_MS : car.liftedUntil;
  return { y: now < liftedUntil ? STILL_LIFT : 0, vy: 0, squash: 0, liftedUntil };
}
