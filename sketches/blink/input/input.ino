#include <Arduino.h>
#include <board_led.h>
#include <serial_io.h>

BoardLed led;
SerialInput input;
SerialOutput output;
int blinkDelay = 1000;

void setup() {
  output.begin("blink/input");
  led.begin();
}

void loop() {
  if (input.ready()) {
    String line = input.take();
    if (isDigit(line[0])) {
      blinkDelay = constrain(line.toInt(), 100, 2000);
      output.print("delay ");
      output.println(blinkDelay);
    }
  }
  output.println("HIGH");
  led.write(HIGH);
  delay(blinkDelay);
  output.println("LOW");
  led.write(LOW);
  delay(blinkDelay);
}
