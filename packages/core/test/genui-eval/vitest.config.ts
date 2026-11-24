import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/core/test/genui-eval/*.eval.ts'],
    testTimeout: 7_200_000,
    env: { DO_NOT_TRACK: '1' },
  },
});
