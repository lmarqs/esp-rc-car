#include "wheel_mixer.h"

#include <math.h>

const int32_t DEAD_ZONE = 62;

static int32_t clampToStickMax(int32_t value) {
  if (value > STICK_MAX) {
    return STICK_MAX;
  }

  if (value < -STICK_MAX) {
    return -STICK_MAX;
  }

  return value;
}

static int32_t shapeAxis(int32_t value) {
  if (value < DEAD_ZONE && value > -DEAD_ZONE) {
    return 0;
  }

  return clampToStickMax(value);
}

struct Contribution {
  int32_t values[4];
  int32_t magnitude;
};

/**
 * Wheels a and b turn together, as do wheels c and d. Rotation and translation differ only in how the four wheels
 * pair up.
 */
static Contribution contribution(Stick stick, int a, int b, int c, int d) {
  int32_t x = shapeAxis(stick.x);
  int32_t y = shapeAxis(stick.y);
  int32_t magnitude = clampToStickMax(sqrt((x * x) + (y * y)));

  Contribution result = {{0, 0, 0, 0}, magnitude};
  int32_t* speeds = result.values;

  // The quadrants share their edges; on an edge the later branch wins.
  if (x >= 0 && y <= 0) {
    speeds[a] = speeds[b] = -y - x;
    speeds[c] = speeds[d] = +magnitude;
  }

  if (x >= 0 && y >= 0) {
    speeds[a] = speeds[b] = -magnitude;
    speeds[c] = speeds[d] = -y + x;
  }

  if (x <= 0 && y >= 0) {
    speeds[a] = speeds[b] = -y - x;
    speeds[c] = speeds[d] = -magnitude;
  }

  if (x <= 0 && y <= 0) {
    speeds[a] = speeds[b] = +magnitude;
    speeds[c] = speeds[d] = -y + x;
  }

  return result;
}

WheelSpeeds mixWheels(Stick rotation, Stick translation) {
  Contribution r = contribution(rotation, 0, 3, 1, 2);
  Contribution t = contribution(translation, 0, 2, 1, 3);
  int32_t total = r.magnitude + t.magnitude;

  WheelSpeeds result = {{0, 0, 0, 0}};

  if (!total) {
    return result;
  }

  for (int i = 0; i < 4; i++) {
    result.values[i] = (r.values[i] * r.magnitude + t.values[i] * t.magnitude) / total;
  }

  return result;
}
