#include <Arduino.h>
#include <ledc_pin.h>
#include <serial_io.h>
#include <servo.h>

EspLedcOutPin servoPin(13, 50, 16);
PositionalServo servo(&servoPin);
SerialOutput output;

void setup() {
  output.begin("servo/sweep");
  servo.begin();
}

void loop() {
  for (int angle = 0; angle <= 180; angle += 1) {
    servo.write(angle);
    output.print("angle ");
    output.println(angle);
    delay(15);
  }

  for (int angle = 179; angle >= 1; angle -= 1) {
    servo.write(angle);
    output.print("angle ");
    output.println(angle);
    delay(15);
  }
}
