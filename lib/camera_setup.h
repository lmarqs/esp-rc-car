#pragma once

#ifdef ESP32
#include <esp_camera.h>

sensor_t *esp_camera_setup();
#endif
