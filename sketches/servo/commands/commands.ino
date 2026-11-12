#include <Arduino.h>
#include <ledc_pin.h>
#include <serial_io.h>
#include <servo.h>

EspLedcOutPin servoPin(13, 50, 16);
PositionalServo servo(&servoPin);
SerialInput input;
SerialOutput output;
int angle = 90;
int step = 1;
bool sweeping = false;
unsigned long lastStep = 0;

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
  output.begin("servo/commands");
  servo.begin();
  writeAngle(angle);
}

static void runCommand(String line) {
  if (line.startsWith("angle ")) {
    String text = line.substring(6);
    if (isNumber(text, 0, 180)) {
      sweeping = false;
      writeAngle(text.toInt());
    } else {
      output.println("error angle must be 0-180");
    }
  } else if (line == "sweep") {
    if (!sweeping) {
      sweeping = true;
      step = 1;
    }
    output.println("sweeping");
  } else if (line == "stop") {
    sweeping = false;
    output.println("stopped");
  } else if (line.length() > 0) {
    output.println("error unknown command");
  }
}

void loop() {
  while (input.ready()) {
    runCommand(input.take());
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
