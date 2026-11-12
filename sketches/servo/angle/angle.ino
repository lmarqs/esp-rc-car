#include <Arduino.h>
#include <ledc_pin.h>
#include <serial_io.h>
#include <servo.h>

EspLedcOutPin servoPin(13, 50, 16);
PositionalServo servo(&servoPin);
SerialInput input;
SerialOutput output;

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
  output.print("angle ");
  output.println(value);
}

void setup() {
  output.begin("servo/angle");
  servo.begin();
  writeAngle(90);
}

void loop() {
  if (input.ready()) {
    String line = input.take();
    if (isNumber(line, 0, 180)) {
      writeAngle(line.toInt());
    } else if (line.length() > 0) {
      output.println("error angle must be 0-180");
    }
  }
}
