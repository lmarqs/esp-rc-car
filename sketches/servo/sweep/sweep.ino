#include <Arduino.h>
#include <ledc_pin.h>
#include <servo.h>

EspLedcOutPin servoPin(13, 50, 16);
PositionalServo servo(&servoPin);

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("sketch servo/sweep");
  servo.begin();
}

void loop() {
  for (int angle = 0; angle <= 180; angle += 1) {
    servo.write(angle);
    Serial.print("angle ");
    Serial.println(angle);
    delay(15);
  }

  for (int angle = 179; angle >= 1; angle -= 1) {
    servo.write(angle);
    Serial.print("angle ");
    Serial.println(angle);
    delay(15);
  }
}
