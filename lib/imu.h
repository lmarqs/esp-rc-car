#pragma once

#include <Arduino.h>
#include <Wire.h>

/** One reading of an accelerometer and gyroscope. */
struct ImuSample {
  /** Acceleration on each axis, in g. */
  float ax, ay, az;
  /** Angular rate around each axis, in degrees per second. */
  float gx, gy, gz;
};

/**
 * An MPU6050 accelerometer and gyroscope on an I2C bus the sketch has begun, at ±2 g and ±250 °/s. Its low-pass
 * filter is set to 44 Hz, which damps the vibration of motors on the same frame.
 */
class Mpu6050Imu {
 private:
  TwoWire* wire;
  uint8_t address;
  float gxBias = 0.0f, gyBias = 0.0f, gzBias = 0.0f;

  bool writeRegister(uint8_t reg, uint8_t value);
  bool readRaw(int16_t raw[6]);

 public:
  /** `address` is 0x68 with the sensor's AD0 pin low and 0x69 with it high. */
  Mpu6050Imu(TwoWire* wire, uint8_t address = 0x68);

  /**
   * Wakes the sensor and measures the gyroscope's bias, which takes about a second: the sensor must stay still
   * meanwhile. Returns false when no sensor answers at the address.
   */
  bool begin();

  /** Reads one sample, with the gyroscope's bias removed. Returns false when the bus fails. */
  bool read(ImuSample& sample);
};
