import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/core/test/inbox-eval/*.eval.ts'],
    testTimeout: 1_800_000,
    env: { DO_NOT_TRACK: '1' },
  },
});
