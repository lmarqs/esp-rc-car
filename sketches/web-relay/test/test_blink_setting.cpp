#include <host_test.h>

#include "blink_controller.h"
#include "blink_setting.h"

void setUp() {}
void tearDown() {}

static void test_mode_name_round_trip() {
  const BlinkMode modes[] = {BlinkMode::OFF, BlinkMode::ON, BlinkMode::BLINK};
  for (const BlinkMode mode : modes) {
    BlinkMode parsed;
    TEST_ASSERT_TRUE(parseBlinkMode(blinkModeName(mode), parsed));
    TEST_ASSERT_TRUE(parsed == mode);
  }
}

static void test_parse_rejects_unknown_mode() {
  BlinkMode parsed;
  TEST_ASSERT_FALSE(parseBlinkMode("disco", parsed));
  TEST_ASSERT_FALSE(parseBlinkMode("", parsed));
}

static void test_setting_round_trip() {
  BlinkController saved;
  saved.setMode(BlinkMode::ON);
  saved.setPeriod(1234);

  BlinkController loaded;
  TEST_ASSERT_TRUE(applyBlinkSetting(blinkSettingFrom(saved), loaded));
  TEST_ASSERT_TRUE(loaded.mode() == BlinkMode::ON);
  TEST_ASSERT_EQUAL_UINT32(1234, loaded.period());
}

static void test_setting_rejects_bad_magic() {
  BlinkSetting s = blinkSettingFrom(BlinkController{});
  s.magic = 0x00;
  BlinkController c;
  TEST_ASSERT_FALSE(applyBlinkSetting(s, c));
}

static void test_setting_rejects_bad_version() {
  BlinkSetting s = blinkSettingFrom(BlinkController{});
  s.version = 99;
  BlinkController c;
  TEST_ASSERT_FALSE(applyBlinkSetting(s, c));
}

static void test_setting_rejects_bad_mode() {
  BlinkSetting s = blinkSettingFrom(BlinkController{});
  s.mode = 99;
  BlinkController c;
  TEST_ASSERT_FALSE(applyBlinkSetting(s, c));
}

static void test_rejected_setting_leaves_controller_untouched() {
  BlinkSetting s = blinkSettingFrom(BlinkController{});
  s.magic = 0x00;
  BlinkController c;
  c.setPeriod(777);
  applyBlinkSetting(s, c);
  TEST_ASSERT_EQUAL_UINT32(777, c.period());
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_mode_name_round_trip);
  RUN_TEST(test_parse_rejects_unknown_mode);
  RUN_TEST(test_setting_round_trip);
  RUN_TEST(test_setting_rejects_bad_magic);
  RUN_TEST(test_setting_rejects_bad_version);
  RUN_TEST(test_setting_rejects_bad_mode);
  RUN_TEST(test_rejected_setting_leaves_controller_untouched);
  return UNITY_END();
}
