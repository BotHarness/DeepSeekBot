import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { stylexPlugin } from './scripts/stylex-plugin.mjs';

export default defineConfig({
  plugins: [stylexPlugin({ rootDir: fileURLToPath(new URL('.', import.meta.url)) })],
  oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./apps/docs/src', import.meta.url)),
      '@deepseek-ai/dsh-api-gateway/client': fileURLToPath(
        new URL('./packages/client/test/support/gateway-client.ts', import.meta.url),
      ),
    },
  },
  test: {
    testTimeout: 15_000,
    env: { DO_NOT_TRACK: '1' },
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/docs/test/**/*.test.ts',
      'scripts/test/**/*.test.mjs',
    ],
  },
});
