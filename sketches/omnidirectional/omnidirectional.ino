#include <Arduino.h>
#include <Bluepad32.h>
#include <Wire.h>
#include <digital_pin.h>
#include <h_bridge.h>
#include <ledc_pin.h>
#include <pin.h>

#include "./car.h"
#include "./drive_command.h"
#include "./wheel_mixer.h"

const uint32_t COMMAND_TIMEOUT_MS = 500;
const uint32_t LED_BLINK_MS = 500;

DigitalOutPin led(2);
CarPilot pilot;
DriveCommandSource commands(COMMAND_TIMEOUT_MS);
Controller* controller = NULL;

// Runs in the core's I2C slave task, not in loop()'s task.
void receiveEventHandler(int len) {
  int32_t axis[4];

  if (len != sizeof(axis)) {
    return;
  }

  uint8_t* bytes = (uint8_t*)axis;

  for (size_t i = 0; i < sizeof(axis); i++) {
    if (!Wire.available()) {
      return;
    }

    bytes[i] = Wire.read();
  }

  commands.put(DriveCommandSource::I2C, {{axis[0], axis[1]}, {axis[2], axis[3]}}, millis());
}

void setup() {
  Serial.begin(115200);

  Wire.begin(0x01);
  Wire.onReceive(receiveEventHandler);

  BP32.setup([](Controller* c) { controller = controller == NULL ? c : controller; },
             [](Controller* c) {
               if (controller == c) {
                 controller = NULL;
                 commands.forget(DriveCommandSource::GAMEPAD);
               }
             });

  BP32.forgetBluetoothKeys();
  BP32.enableVirtualDevice(false);

  led.begin();

  pilot.begin();
}

void loop() {
  BP32.update();

  uint32_t now = millis();

  if (controller) {
    commands.put(DriveCommandSource::GAMEPAD,
                 {{controller->axisX(), controller->axisY()}, {controller->axisRX(), controller->axisRY()}}, now);
  }

  led.write(controller || (now / LED_BLINK_MS) % 2 ? HIGH : LOW);

  DriveCommand command;

  if (commands.latest(now, &command)) {
    pilot.drive(mixWheels(command.rotation, command.translation));
  } else {
    pilot.stop();
  }
}
