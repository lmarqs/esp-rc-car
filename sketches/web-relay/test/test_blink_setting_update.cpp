#include <string.h>
#include <host_test.h>

#include "blink_controller.h"
#include "blink_setting_update.h"

void setUp() {}
void tearDown() {}

// --- applyMode ---

static void test_apply_mode_accepts_and_actuates() {
  BlinkController c;  // defaults: BLINK
  TEST_ASSERT_TRUE(applyMode(c, "on", 0) == BlinkOutcome::Accepted);
  TEST_ASSERT_TRUE(c.mode() == BlinkMode::ON);
  TEST_ASSERT_TRUE(c.output().isOn());  // update() ran, lamp is current
}

static void test_apply_mode_rejects_garbage_and_leaves_controller_untouched() {
  BlinkController c;
  c.setMode(BlinkMode::ON);
  TEST_ASSERT_TRUE(applyMode(c, "disco", 0) == BlinkOutcome::Rejected);
  TEST_ASSERT_TRUE(applyMode(c, "", 0) == BlinkOutcome::Rejected);
  TEST_ASSERT_TRUE(c.mode() == BlinkMode::ON);
}

static void test_apply_mode_same_value_is_unchanged() {
  BlinkController c;
  c.setMode(BlinkMode::OFF);
  TEST_ASSERT_TRUE(applyMode(c, "off", 0) == BlinkOutcome::Unchanged);
}

static void test_apply_mode_blink_baselines_without_immediate_toggle() {
  BlinkController c;
  c.setMode(BlinkMode::ON);  // lamp on
  TEST_ASSERT_TRUE(applyMode(c, "blink", 0) == BlinkOutcome::Accepted);
  TEST_ASSERT_FALSE(c.output().isOn());  // first BLINK update only baselines
}

// --- applyPeriod ---

static void test_apply_period_accepts() {
  BlinkController c;  // default period 5000
  TEST_ASSERT_TRUE(applyPeriod(c, "1000", 0) == BlinkOutcome::Accepted);
  TEST_ASSERT_EQUAL_UINT32(1000, c.period());
}

static void test_apply_period_clamps_to_bounds() {
  BlinkController c;
  TEST_ASSERT_TRUE(applyPeriod(c, "1", 0) == BlinkOutcome::Accepted);
  TEST_ASSERT_EQUAL_UINT32(BlinkController::PERIOD_MIN_MS, c.period());

  TEST_ASSERT_TRUE(applyPeriod(c, "99999999", 0) == BlinkOutcome::Accepted);
  TEST_ASSERT_EQUAL_UINT32(BlinkController::PERIOD_MAX_MS, c.period());
}

static void test_apply_period_rejects_non_positive_and_non_numeric() {
  BlinkController c;
  TEST_ASSERT_TRUE(applyPeriod(c, "0", 0) == BlinkOutcome::Rejected);
  TEST_ASSERT_TRUE(applyPeriod(c, "-5", 0) == BlinkOutcome::Rejected);
  TEST_ASSERT_TRUE(applyPeriod(c, "", 0) == BlinkOutcome::Rejected);
  TEST_ASSERT_TRUE(applyPeriod(c, "abc", 0) == BlinkOutcome::Rejected);
  TEST_ASSERT_TRUE(applyPeriod(c, "50abc", 0) == BlinkOutcome::Rejected);  // trailing garbage
  TEST_ASSERT_EQUAL_UINT32(BlinkController::PERIOD_DEFAULT_MS, c.period());
}

static void test_apply_period_same_value_is_unchanged() {
  BlinkController c;
  c.setPeriod(1000);
  TEST_ASSERT_TRUE(applyPeriod(c, "1000", 0) == BlinkOutcome::Unchanged);
}

// --- statusJson ---

static void test_status_json_default() {
  BlinkController c;  // BLINK, 5000, lamp off
  char buf[96];
  statusJson(c, buf, sizeof(buf));
  TEST_ASSERT_EQUAL_STRING("{\"mode\":\"blink\",\"period\":5000,\"lamp\":false}", buf);
}

static void test_status_json_reflects_on_state() {
  BlinkController c;
  applyMode(c, "on", 0);
  applyPeriod(c, "1234", 0);
  char buf[96];
  statusJson(c, buf, sizeof(buf));
  TEST_ASSERT_EQUAL_STRING("{\"mode\":\"on\",\"period\":1234,\"lamp\":true}", buf);
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_apply_mode_accepts_and_actuates);
  RUN_TEST(test_apply_mode_rejects_garbage_and_leaves_controller_untouched);
  RUN_TEST(test_apply_mode_same_value_is_unchanged);
  RUN_TEST(test_apply_mode_blink_baselines_without_immediate_toggle);
  RUN_TEST(test_apply_period_accepts);
  RUN_TEST(test_apply_period_clamps_to_bounds);
  RUN_TEST(test_apply_period_rejects_non_positive_and_non_numeric);
  RUN_TEST(test_apply_period_same_value_is_unchanged);
  RUN_TEST(test_status_json_default);
  RUN_TEST(test_status_json_reflects_on_state);
  return UNITY_END();
}
