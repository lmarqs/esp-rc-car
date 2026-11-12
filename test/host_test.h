#pragma once

/**
 * The few Unity macros the tests of lib/ use, so the tests build with nothing but a C++ compiler. A failed
 * assertion ends its test, as in Unity, and the program exits non-zero when any test failed.
 */

#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>

struct HostTestFailure {
  int line;
  std::string message;
};

struct HostTestRun {
  int tests = 0;
  int failures = 0;
};

inline HostTestRun& hostTestRun() {
  static HostTestRun run;
  return run;
}

inline void hostTestRunOne(void (*test)(), const char* name) {
  HostTestRun& run = hostTestRun();
  run.tests++;
  try {
    test();
    std::printf("PASS %s\n", name);
  } catch (const HostTestFailure& failure) {
    run.failures++;
    std::printf("FAIL %s, line %d: %s\n", name, failure.line, failure.message.c_str());
  }
}

inline int hostTestEnd() {
  HostTestRun& run = hostTestRun();
  std::printf("%d tests, %d failures\n", run.tests, run.failures);
  return run.failures == 0 ? 0 : 1;
}

#define HOST_TEST_CHECK(condition, message)     \
  do {                                          \
    if (!(condition)) {                         \
      throw HostTestFailure{__LINE__, message}; \
    }                                           \
  } while (0)

#define UNITY_BEGIN() (void)0
#define UNITY_END() hostTestEnd()
#define RUN_TEST(test) hostTestRunOne(test, #test)

#define TEST_ASSERT_TRUE(actual) HOST_TEST_CHECK((actual), "expected true: " #actual)
#define TEST_ASSERT_FALSE(actual) HOST_TEST_CHECK(!(actual), "expected false: " #actual)
#define TEST_ASSERT_EQUAL_STRING(expected, actual) \
  HOST_TEST_CHECK(std::strcmp((expected), (actual)) == 0, "expected " #actual " to equal " #expected)
#define TEST_ASSERT_FLOAT_WITHIN(delta, expected, actual)                              \
  HOST_TEST_CHECK(std::fabs((double)(expected) - (double)(actual)) <= (double)(delta), \
                  "expected " #actual " within " #delta " of " #expected)
