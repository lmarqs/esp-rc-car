#include <Arduino.h>
#include <digital_pin.h>

DigitalOutPin led(2);

void setup() {
  Serial.begin(9600);
  led.begin();
}

void loop() {
  Serial.println("HIGH");
  led.write(HIGH);
  delay(1000);
  Serial.println("LOW");
  led.write(LOW);
  delay(1000);
}
