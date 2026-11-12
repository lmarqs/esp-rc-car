#include <host_test.h>

#include "blink_controller.h"

void setUp() {}
void tearDown() {}

static void test_default_state() {
  BlinkController c;
  TEST_ASSERT_TRUE(c.mode() == BlinkMode::BLINK);
  TEST_ASSERT_EQUAL_UINT32(BlinkController::PERIOD_DEFAULT_MS, c.period());
  TEST_ASSERT_FALSE(c.output().isOn());
}

static void test_mode_on_forces_output() {
  BlinkController c;
  c.setMode(BlinkMode::ON);
  TEST_ASSERT_TRUE(c.update(0));  // output changes once...
  TEST_ASSERT_TRUE(c.output().isOn());
  TEST_ASSERT_FALSE(c.update(1));  // ...then holds
  TEST_ASSERT_TRUE(c.output().isOn());
}

static void test_mode_off_forces_output() {
  BlinkController c;
  c.setMode(BlinkMode::ON);
  c.update(0);
  c.setMode(BlinkMode::OFF);
  TEST_ASSERT_TRUE(c.update(1));
  TEST_ASSERT_FALSE(c.output().isOn());
  TEST_ASSERT_FALSE(c.update(2));
}

static void test_period_clamp_low() {
  BlinkController c;
  c.setPeriod(50);
  TEST_ASSERT_EQUAL_UINT32(BlinkController::PERIOD_MIN_MS, c.period());
}

static void test_period_clamp_high() {
  BlinkController c;
  c.setPeriod(99999999);
  TEST_ASSERT_EQUAL_UINT32(BlinkController::PERIOD_MAX_MS, c.period());
}

static void test_blink_toggle_timing() {
  BlinkController c;
  c.setPeriod(1000);
  TEST_ASSERT_FALSE(c.update(0));  // first call only establishes the baseline
  TEST_ASSERT_FALSE(c.update(999));
  TEST_ASSERT_TRUE(c.update(1000));  // toggle on at the boundary
  TEST_ASSERT_TRUE(c.output().isOn());
  TEST_ASSERT_FALSE(c.update(1999));
  TEST_ASSERT_TRUE(c.update(2000));  // and back off one period later
  TEST_ASSERT_FALSE(c.output().isOn());
}

static void test_millis_rollover() {
  BlinkController c;
  c.setPeriod(1000);
  const uint32_t seed = 4294966784u;  // 0xFFFFFE00, 512 ms before rollover
  TEST_ASSERT_FALSE(c.update(seed));  // baseline near the wrap
  TEST_ASSERT_FALSE(c.update(487u));  // 999 ms elapsed across the wrap
  TEST_ASSERT_TRUE(c.update(488u));   // 1000 ms elapsed across the wrap
  TEST_ASSERT_TRUE(c.output().isOn());
}

static void test_blink_resumes_after_on() {
  BlinkController c;
  c.setPeriod(1000);
  c.update(0);
  c.setMode(BlinkMode::ON);
  c.update(10);
  TEST_ASSERT_TRUE(c.output().isOn());

  c.setMode(BlinkMode::BLINK);
  TEST_ASSERT_FALSE(c.update(20));  // re-baseline, output holds
  TEST_ASSERT_TRUE(c.output().isOn());
  TEST_ASSERT_FALSE(c.update(1019));
  TEST_ASSERT_TRUE(c.update(1020));  // toggles a full period after resuming
  TEST_ASSERT_FALSE(c.output().isOn());
}

static void test_restore_applies_and_clamps() {
  BlinkController c;
  c.restore(BlinkMode::ON, 50);
  TEST_ASSERT_TRUE(c.mode() == BlinkMode::ON);
  TEST_ASSERT_EQUAL_UINT32(BlinkController::PERIOD_MIN_MS, c.period());
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_default_state);
  RUN_TEST(test_mode_on_forces_output);
  RUN_TEST(test_mode_off_forces_output);
  RUN_TEST(test_period_clamp_low);
  RUN_TEST(test_period_clamp_high);
  RUN_TEST(test_blink_toggle_timing);
  RUN_TEST(test_millis_rollover);
  RUN_TEST(test_blink_resumes_after_on);
  RUN_TEST(test_restore_applies_and_clamps);
  return UNITY_END();
}
