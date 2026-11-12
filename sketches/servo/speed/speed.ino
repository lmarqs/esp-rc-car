#include <Arduino.h>
#include <ledc_pin.h>
#include <serial_io.h>
#include <servo.h>

EspLedcOutPin servoPin(13, 50, 16);
PositionalServo servo(&servoPin);
SerialInput input;
SerialOutput output;
int angle = 90;
int target = angle;
int speed = 60;
bool sweeping = false;
unsigned long lastMove = 0;

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
  output.print("angle ");
  output.println(angle);
}

void setup() {
  output.begin("servo/speed");
  servo.begin();
  writeAngle(angle);
}

static void runCommand(String line) {
  if (line.startsWith("angle ")) {
    String text = line.substring(6);
    if (isNumber(text, 0, 180)) {
      sweeping = false;
      target = text.toInt();
      output.print("target ");
      output.println(target);
    } else {
      output.println("error angle must be 0-180");
    }
  } else if (line.startsWith("speed ")) {
    String text = line.substring(6);
    if (isNumber(text, 1, 360)) {
      speed = text.toInt();
      output.print("speed ");
      output.println(speed);
    } else {
      output.println("error speed must be 1-360");
    }
  } else if (line == "sweep") {
    if (!sweeping) {
      sweeping = true;
      target = angle == 180 ? 0 : 180;
    }
    output.println("sweeping");
  } else if (line == "stop") {
    sweeping = false;
    target = angle;
    output.println("stopped");
  } else if (line.length() > 0) {
    output.println("error unknown command");
  }
}

void loop() {
  while (input.ready()) {
    runCommand(input.take());
  }
  if (sweeping && angle == target) {
    target = angle == 180 ? 0 : 180;
  }
  if (angle != target && micros() - lastMove >= 1000000UL / speed) {
    lastMove = micros();
    writeAngle(angle + (target > angle ? 1 : -1));
  }
}
