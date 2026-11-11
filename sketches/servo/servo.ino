#include <Arduino.h>
#include <esp_ledc_pin.h>

const uint8_t SERVO_PIN = 13;
const uint8_t SERVO_CHANNEL = 0;
const uint32_t SERVO_FREQUENCY_HZ = 50;
const uint8_t SERVO_RESOLUTION_BITS = 16;
const uint32_t SERVO_PERIOD_US = 1000000 / SERVO_FREQUENCY_HZ;
const uint32_t SERVO_MIN_PULSE_US = 544;
const uint32_t SERVO_MAX_PULSE_US = 2400;

const int MIN_ANGLE = 0;
const int MAX_ANGLE = 180;

EspLedcOutPin servo(SERVO_PIN, SERVO_CHANNEL, SERVO_FREQUENCY_HZ, SERVO_RESOLUTION_BITS);

uint32_t angleToDuty(int angle) {
  uint32_t pulse = map(angle, 0, 180, SERVO_MIN_PULSE_US, SERVO_MAX_PULSE_US);
  return (pulse << SERVO_RESOLUTION_BITS) / SERVO_PERIOD_US;
}

void setup() { servo.begin(); }

void loop() {
  for (int angle = MIN_ANGLE; angle <= MAX_ANGLE; angle += 1) {
    servo.write(angleToDuty(angle));
    delay(15);
  }

  for (int angle = MAX_ANGLE; angle >= MIN_ANGLE; angle -= 1) {
    servo.write(angleToDuty(angle));
    delay(15);
  }
}
