#include <Arduino.h>
#include <ledc_pin.h>
#include <servo.h>

EspLedcOutPin servoPin(13, 50, 16);
PositionalServo servo(&servoPin);
int angle = 90;
int step = 1;
bool sweeping = false;
unsigned long lastStep = 0;
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

static void writeAngle(int value) {
  angle = value;
  servo.write(angle);
  Serial.print("angle ");
  Serial.println(angle);
}

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("sketch servo/commands");
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
        writeAngle(text.toInt());
      } else {
        Serial.println("error angle must be 0-180");
      }
    } else if (line == "sweep") {
      if (!sweeping) {
        sweeping = true;
        step = 1;
      }
      Serial.println("sweeping");
    } else if (line == "stop") {
      sweeping = false;
      Serial.println("stopped");
    } else if (line.length() > 0) {
      Serial.println("error unknown command");
    }
    line = "";
  }
  if (sweeping && millis() - lastStep >= 15) {
    lastStep = millis();
    if (angle == 180) {
      step = -1;
    } else if (angle == 0) {
      step = 1;
    }
    writeAngle(angle + step);
  }
}
