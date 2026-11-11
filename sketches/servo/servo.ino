#include <Arduino.h>
#include <esp_ledc_pin.h>
#include <servo.h>

const uint32_t SERVO_FREQUENCY_HZ = 50;
const uint8_t SERVO_RESOLUTION_BITS = 16;

EspLedcOutPin servoPin(13, 0, SERVO_FREQUENCY_HZ, SERVO_RESOLUTION_BITS);
PositionalServo servo(&servoPin, SERVO_FREQUENCY_HZ, SERVO_RESOLUTION_BITS);

void setup() { servo.begin(); }

void loop() {
  for (int angle = 0; angle <= 180; angle += 1) {
    servo.write(angle);
    delay(15);
  }

  for (int angle = 180; angle >= 0; angle -= 1) {
    servo.write(angle);
    delay(15);
  }
}
