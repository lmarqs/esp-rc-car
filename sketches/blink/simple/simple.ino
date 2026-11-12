#include <Arduino.h>
#include <digital_pin.h>
#include <serial_io.h>

DigitalOutPin led(2);
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
