#include <Arduino.h>
#include <digital_pin.h>

DigitalOutPin led(2);
int blinkDelay = 1000;
bool ledOn = false;
unsigned long lastToggle = 0;
String line;

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("sketch blink/timer");
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
    if (isDigit(line[0])) {
      blinkDelay = constrain(line.toInt(), 100, 2000);
      Serial.print("delay ");
      Serial.println(blinkDelay);
    }
    line = "";
  }
  if (millis() - lastToggle >= blinkDelay) {
    lastToggle = millis();
    ledOn = !ledOn;
    Serial.println(ledOn ? "HIGH" : "LOW");
    led.write(ledOn);
  }
}
