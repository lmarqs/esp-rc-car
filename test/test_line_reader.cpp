#include <host_test.h>
#include <line_reader.h>

#include <string>

static bool feedAll(LineReader& reader, const char* bytes) {
  bool ended = false;
  for (const char* c = bytes; *c != '\0'; c++) {
    ended = reader.feed(*c);
  }
  return ended;
}

void test_lf_ends_a_line(void) {
  LineReader reader;
  TEST_ASSERT_FALSE(feedAll(reader, "cfg get"));
  TEST_ASSERT_TRUE(reader.feed('\n'));
  TEST_ASSERT_EQUAL_STRING("cfg get", reader.line());
}

void test_cr_ends_a_line(void) {
  LineReader reader;
  TEST_ASSERT_TRUE(feedAll(reader, "stop\r"));
  TEST_ASSERT_EQUAL_STRING("stop", reader.line());
}

void test_crlf_gives_one_line(void) {
  LineReader reader;
  TEST_ASSERT_TRUE(feedAll(reader, "stop\r"));
  TEST_ASSERT_FALSE(reader.feed('\n'));
  TEST_ASSERT_TRUE(feedAll(reader, "sweep\r"));
  TEST_ASSERT_EQUAL_STRING("sweep", reader.line());
}

void test_empty_lines_are_skipped(void) {
  LineReader reader;
  TEST_ASSERT_FALSE(feedAll(reader, "\n\n\r"));
  TEST_ASSERT_TRUE(feedAll(reader, "a\n"));
  TEST_ASSERT_EQUAL_STRING("a", reader.line());
}

void test_spaces_are_kept(void) {
  LineReader reader;
  TEST_ASSERT_TRUE(feedAll(reader, " cfg set ap_password  two spaces \n"));
  TEST_ASSERT_EQUAL_STRING(" cfg set ap_password  two spaces ", reader.line());
}

void test_next_line_starts_fresh(void) {
  LineReader reader;
  TEST_ASSERT_TRUE(feedAll(reader, "first\n"));
  TEST_ASSERT_TRUE(feedAll(reader, "2nd\n"));
  TEST_ASSERT_EQUAL_STRING("2nd", reader.line());
}

void test_long_line_is_cut_at_capacity(void) {
  LineReader reader;
  const std::string longLine(LineReader::CAPACITY + 10, 'x');
  TEST_ASSERT_TRUE(feedAll(reader, (longLine + "\n").c_str()));
  TEST_ASSERT_EQUAL_STRING(std::string(LineReader::CAPACITY - 1, 'x').c_str(), reader.line());
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_lf_ends_a_line);
  RUN_TEST(test_cr_ends_a_line);
  RUN_TEST(test_crlf_gives_one_line);
  RUN_TEST(test_empty_lines_are_skipped);
  RUN_TEST(test_spaces_are_kept);
  RUN_TEST(test_next_line_starts_fresh);
  RUN_TEST(test_long_line_is_cut_at_capacity);
  return UNITY_END();
}
