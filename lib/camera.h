#pragma once

#ifdef ESP32
#include <Arduino.h>
#include <esp_camera.h>

using EspCameraPictureReader = std::function<void(camera_fb_t*)>;

class EspCamera {
 public:
  /** Returns false when the camera cannot start: no LEDC timer is left for its clock, or the driver fails to init. */
  bool begin();
  void capture(EspCameraPictureReader reader);
};
#endif
