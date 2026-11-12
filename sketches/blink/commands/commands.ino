#include <Arduino.h>
#include <digital_pin.h>
#include <serial_io.h>

DigitalOutPin led(2);
SerialInput input;
SerialOutput output;
int blinkDelay = 1000;
bool ledOn = false;
bool paused = false;
unsigned long lastToggle = 0;

void setup() {
  output.begin("blink/commands");
  led.begin();
}

static void runCommand(String line) {
  if (line == "pause") {
    paused = true;
    output.println("paused");
  } else if (line == "run") {
    paused = false;
    output.println("running");
  } else if (line.startsWith("delay ") && isDigit(line[6])) {
    blinkDelay = constrain(line.substring(6).toInt(), 100, 2000);
    output.print("delay ");
    output.println(blinkDelay);
  } else if (line.length() > 0) {
    output.print("? ");
    output.println(line);
  }
}

void loop() {
  while (input.ready()) {
    runCommand(input.take());
  }
  if (!paused && millis() - lastToggle >= blinkDelay) {
    lastToggle = millis();
    ledOn = !ledOn;
    output.println(ledOn ? "HIGH" : "LOW");
    led.write(ledOn);
  }
}
