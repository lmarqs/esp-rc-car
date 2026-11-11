#pragma once

#include <Arduino.h>

int32_t ignoreControllerAxisDeathZone(int32_t axisValue) {
  int32_t deathZone = 62;

  if (axisValue < deathZone && axisValue > -deathZone) {
    return 0;
  }

  return axisValue;
}

int32_t hardcapControllerAxisValue(int32_t axisValue) {
  int32_t maxValue = 512;

  if (axisValue > maxValue) {
    return maxValue;
  }

  if (axisValue < -maxValue) {
    return -maxValue;
  }

  return axisValue;
}
