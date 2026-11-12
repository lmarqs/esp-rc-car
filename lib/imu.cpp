#include "imu.h"

const uint8_t REG_SMPLRT_DIV = 0x19;
const uint8_t REG_CONFIG = 0x1A;
const uint8_t REG_GYRO_CONFIG = 0x1B;
const uint8_t REG_ACCEL_CONFIG = 0x1C;
const uint8_t REG_ACCEL_XOUT_H = 0x3B;
const uint8_t REG_PWR_MGMT_1 = 0x6B;

const float ACCEL_LSB_PER_G = 16384.0f;
const float GYRO_LSB_PER_DPS = 131.0f;

const uint16_t BIAS_SAMPLES = 500;

Mpu6050Imu::Mpu6050(TwoWire* wire, uint8_t address) {
  this->wire = wire;
  this->address = address;
}

bool Mpu6050Imu::writeRegister(uint8_t reg, uint8_t value) {
  wire->beginTransmission(address);
  wire->write(reg);
  wire->write(value);
  return wire->endTransmission() == 0;
}

bool Mpu6050Imu::readRaw(int16_t raw[6]) {
  wire->beginTransmission(address);
  wire->write(REG_ACCEL_XOUT_H);
  if (wire->endTransmission(false) != 0) {
    return false;
  }

  // The sensor sends 14 bytes: three acceleration words, one temperature word and three rate words, high byte first.
  uint8_t bytes[14];
  if (wire->requestFrom(address, (uint8_t)sizeof(bytes)) != sizeof(bytes)) {
    return false;
  }
  for (uint8_t i = 0; i < sizeof(bytes); i++) {
    bytes[i] = wire->read();
  }

  for (uint8_t word = 0, i = 0; word < 7; word++) {
    if (word == 3) {
      continue;
    }
    raw[i++] = (int16_t)((bytes[word * 2] << 8) | bytes[word * 2 + 1]);
  }
  return true;
}

bool Mpu6050Imu::begin() {
  // The sensor powers up asleep, and a sensor that is absent does not acknowledge the write.
  if (!writeRegister(REG_PWR_MGMT_1, 0x00)) {
    return false;
  }
  writeRegister(REG_SMPLRT_DIV, 0x00);
  writeRegister(REG_CONFIG, 0x03);
  writeRegister(REG_GYRO_CONFIG, 0x00);
  writeRegister(REG_ACCEL_CONFIG, 0x00);
  delay(50);

  float sums[3] = {0.0f, 0.0f, 0.0f};
  uint16_t taken = 0;
  for (uint16_t i = 0; i < BIAS_SAMPLES; i++) {
    int16_t raw[6];
    if (!readRaw(raw)) {
      continue;
    }
    sums[0] += raw[3];
    sums[1] += raw[4];
    sums[2] += raw[5];
    taken++;
    delay(2);
  }
  if (taken > 0) {
    gxBias = sums[0] / taken / GYRO_LSB_PER_DPS;
    gyBias = sums[1] / taken / GYRO_LSB_PER_DPS;
    gzBias = sums[2] / taken / GYRO_LSB_PER_DPS;
  }
  return true;
}

bool Mpu6050Imu::read(ImuSample& sample) {
  int16_t raw[6];
  if (!readRaw(raw)) {
    return false;
  }

  sample.ax = raw[0] / ACCEL_LSB_PER_G;
  sample.ay = raw[1] / ACCEL_LSB_PER_G;
  sample.az = raw[2] / ACCEL_LSB_PER_G;
  sample.gx = raw[3] / GYRO_LSB_PER_DPS - gxBias;
  sample.gy = raw[4] / GYRO_LSB_PER_DPS - gyBias;
  sample.gz = raw[5] / GYRO_LSB_PER_DPS - gzBias;
  return true;
}
