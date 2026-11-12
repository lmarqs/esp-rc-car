#include <Arduino.h>
#include <ledc_pin.h>
#include <servo.h>

EspLedcOutPin servoPin(13, 50, 16);
PositionalServo servo(&servoPin);
int angle = 90;
int target = angle;
int speed = 60;
bool sweeping = false;
unsigned long lastMove = 0;
String line;

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

static void writeAngle(int degrees) {
  angle = degrees;
  servo.write(angle);
  Serial.print("angle ");
  Serial.println(angle);
}

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("sketch servo/speed");
  servo.begin();
  writeAngle(angle);
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c != '\n') {
      line += c;
      continue;
    }
    line.trim();
    if (line.startsWith("angle ")) {
      String text = line.substring(6);
      if (isNumber(text, 0, 180)) {
        sweeping = false;
        target = text.toInt();
        Serial.print("target ");
        Serial.println(target);
      } else {
        Serial.println("error angle must be 0-180");
      }
    } else if (line.startsWith("speed ")) {
      String text = line.substring(6);
      if (isNumber(text, 1, 360)) {
        speed = text.toInt();
        Serial.print("speed ");
        Serial.println(speed);
      } else {
        Serial.println("error speed must be 1-360");
      }
    } else if (line == "sweep") {
      if (!sweeping) {
        sweeping = true;
        target = angle == 180 ? 0 : 180;
      }
      Serial.println("sweeping");
    } else if (line == "stop") {
      sweeping = false;
      target = angle;
      Serial.println("stopped");
    } else if (line.length() > 0) {
      Serial.println("error unknown command");
    }
    line = "";
  }
  if (sweeping && angle == target) {
    target = angle == 180 ? 0 : 180;
  }
  if (angle != target && millis() - lastMove >= 1000 / speed) {
    lastMove = millis();
    writeAngle(angle + (target > angle ? 1 : -1));
  }
}
