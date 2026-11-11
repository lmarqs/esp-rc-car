#pragma once

#ifdef ESP32
#include <Arduino.h>
#include <esp_camera.h>

using EspCameraPictureReader = std::function<void(camera_fb_t *)>;

class EspCamera {
 private:
  sensor_t *sensor;

 public:
  void begin();
  void capture(EspCameraPictureReader reader);
};
#endif
