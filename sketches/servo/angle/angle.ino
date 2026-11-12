#include <Arduino.h>
#include <ledc_pin.h>
#include <servo.h>

EspLedcOutPin servoPin(13, 50, 16);
PositionalServo servo(&servoPin);

static bool isNumber(String text, int low, int high) {
  if (text.length() < 1 || text.length() > 3) {
    return false;
  }
  for (int i = 0; i < text.length(); i++) {
    if (!isDigit(text[i])) {
      return false;
    }
  }
  return text.toInt() >= low && text.toInt() <= high;
}

static void writeAngle(int value) {
  servo.write(value);
  Serial.print("angle ");
  Serial.println(value);
}

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("sketch servo/angle");
  servo.begin();
  writeAngle(90);
}

void loop() {
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (isNumber(line, 0, 180)) {
      writeAngle(line.toInt());
    } else if (line.length() > 0) {
      Serial.println("error angle must be 0-180");
    }
  }
}
