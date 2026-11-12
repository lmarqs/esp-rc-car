#include <Arduino.h>
#include <board_led.h>
#include <serial_io.h>

BoardLed led;
SerialOutput output;

void setup() {
  output.begin("blink/simple");
  led.begin();
}

void loop() {
  output.println("HIGH");
  led.write(HIGH);
  delay(1000);
  output.println("LOW");
  led.write(LOW);
  delay(1000);
}
