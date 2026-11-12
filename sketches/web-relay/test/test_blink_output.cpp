#include <host_test.h>

#include "blink_output.h"

void setUp() {}
void tearDown() {}

static void test_on_state_is_on_and_named_on() {
  const BlinkOutput out{true};
  TEST_ASSERT_TRUE(out.isOn());
  TEST_ASSERT_EQUAL_STRING("on", out.name());
}

static void test_off_state_is_off_and_named_off() {
  const BlinkOutput out{false};
  TEST_ASSERT_FALSE(out.isOn());
  TEST_ASSERT_EQUAL_STRING("off", out.name());
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_on_state_is_on_and_named_on);
  RUN_TEST(test_off_state_is_off_and_named_off);
  return UNITY_END();
}
