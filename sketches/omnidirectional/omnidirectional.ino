#include <Arduino.h>
#include <Bluepad32.h>
#include <Wire.h>
#include <digital_pin.h>
#include <h_bridge.h>
#include <ledc_pin.h>
#include <pin.h>

#include "./car.h"
#include "./controller.h"

DigitalOutPin led(2);
CarPilot pilot;
Controller* controller = NULL;

void receiveEventHandler(int len) {
  if (controller) {
    return;
  }

  size_t size = 4 * sizeof(int32_t);

  if (len != size) {
    return;
  }

  int8_t buf[size];

  int8_t i = -1;

  while (++i < size && Wire.available()) {
    buf[i] = Wire.read();
  }

  if (i != size) {
    return;
  }

  int32_t* axis = (int32_t*)buf;

  move(axis[0], axis[1], axis[2], axis[3]);
}

void move(int32_t axisLX, int32_t axisLY, int32_t axisRX, int32_t axisRY) {
  axisLX = hardcapControllerAxisValue(ignoreControllerAxisDeathZone(axisLX));
  axisLY = hardcapControllerAxisValue(ignoreControllerAxisDeathZone(axisLY));
  axisRX = hardcapControllerAxisValue(ignoreControllerAxisDeathZone(axisRX));
  axisRY = hardcapControllerAxisValue(ignoreControllerAxisDeathZone(axisRY));

  int32_t normalL = hardcapControllerAxisValue(sqrt((axisLX * axisLX) + (axisLY * axisLY)));
  int32_t normalR = hardcapControllerAxisValue(sqrt((axisRX * axisRX) + (axisRY * axisRY)));

  pilot.calculateRotation(axisLX, axisLY, normalL);

  pilot.calculateTranslation(axisRX, axisRY, normalR);

  pilot.drive();
}

void setup() {
  Serial.begin(9600);

  Wire.begin(0x01);
  Wire.onReceive(receiveEventHandler);

  BP32.setup([controller](Controller* c) { controller = controller == NULL ? c : controller; },
             [controller](Controller* c) { controller = controller == c ? NULL : controller; });

  BP32.forgetBluetoothKeys();
  BP32.enableVirtualDevice(false);

  led.begin();

  pilot.begin();
}

void loop() {
  BP32.update();

  pilot.noSignal();

  if (!controller) {
    led.write(LOW);
    delay(500);
    led.write(HIGH);
    delay(500);
    return;
  }

  move(controller->axisX(), controller->axisY(), controller->axisRX(), controller->axisRY());
}
