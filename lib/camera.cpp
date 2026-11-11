#include "camera.h"

#ifdef ESP32
#include <Arduino.h>
#include <esp_camera.h>

#include "camera_setup.h"

void EspCamera::begin() { sensor = esp_camera_setup(); }

void EspCamera::capture(EspCameraPictureReader reader) {
  camera_fb_t* fb = esp_camera_fb_get();

  if (!fb) {
    Serial.println("Frame buffer could not be acquired");
    return;
  }

  reader(fb);

  esp_camera_fb_return(fb);

  fb = NULL;
}
#endif
