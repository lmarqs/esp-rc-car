#include <Arduino.h>
#include <digital_pin.h>

DigitalOutPin led(2);
int blinkDelay = 1000;

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("sketch blink/input");
  led.begin();
}

void loop() {
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (isDigit(line[0])) {
      blinkDelay = constrain(line.toInt(), 100, 2000);
      Serial.print("delay ");
      Serial.println(blinkDelay);
    }
  }
  Serial.println("HIGH");
  led.write(HIGH);
  delay(blinkDelay);
  Serial.println("LOW");
  led.write(LOW);
  delay(blinkDelay);
}
