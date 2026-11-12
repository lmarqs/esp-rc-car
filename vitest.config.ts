import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['site/tests/unit/**/*.test.ts'],
  },
});
