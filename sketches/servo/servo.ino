#include <Arduino.h>
#include <ledc_pin.h>
#include <servo.h>

EspLedcOutPin servoPin(13, 50, 16);
PositionalServo servo(&servoPin);

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
