#include <Arduino.h>
#include <board_led.h>
#include <serial_io.h>

BoardLed led;
SerialInput input;
SerialOutput output;
int blinkDelay = 1000;
bool ledOn = false;
unsigned long lastToggle = 0;

void setup() {
  output.begin("blink/timer");
  led.begin();
}

void loop() {
  while (input.ready()) {
    String line = input.take();
    if (isDigit(line[0])) {
      blinkDelay = constrain(line.toInt(), 100, 2000);
      output.print("delay ");
      output.println(blinkDelay);
    }
  }
  if (millis() - lastToggle >= blinkDelay) {
    lastToggle = millis();
    ledOn = !ledOn;
    output.println(ledOn ? "HIGH" : "LOW");
    led.write(ledOn);
  }
}
