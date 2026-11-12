#include <Arduino.h>
#include <digital_pin.h>

DigitalOutPin led(2);
int blinkDelay = 1000;
bool ledOn = false;
bool paused = false;
unsigned long nextToggle = 0;
String line;

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("sketch blink/commands");
  led.begin();
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c != '\n') {
      line += c;
      continue;
    }
    line.trim();
    if (line == "pause") {
      paused = true;
      Serial.println("paused");
    } else if (line == "run") {
      paused = false;
      Serial.println("running");
    } else if (line.startsWith("delay ") && isDigit(line[6])) {
      blinkDelay = constrain(line.substring(6).toInt(), 100, 2000);
      Serial.print("delay ");
      Serial.println(blinkDelay);
    } else if (line.length() > 0) {
      Serial.print("? ");
      Serial.println(line);
    }
    line = "";
  }
  if (!paused && millis() >= nextToggle) {
    nextToggle = millis() + blinkDelay;
    ledOn = !ledOn;
    Serial.println(ledOn ? "HIGH" : "LOW");
    led.write(ledOn);
  }
}
