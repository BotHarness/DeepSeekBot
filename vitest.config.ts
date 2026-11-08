import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig, type ViteUserConfig } from 'vitest/config';

import { stylexPlugin } from './scripts/stylex-plugin.mjs';

const genuiBudgetTests = [
  'packages/core/test/genui-vm.test.ts',
  'packages/core/test/genui-guest.test.ts',
  'packages/core/test/genui-execution-session.test.ts',
  'packages/core/test/genui-execution-worker.test.ts',
  'packages/client/test/genui-dom-mirror.test.ts',
];

function sourceOptions(): ViteUserConfig {
  return {
    plugins: [stylexPlugin({ rootDir: fileURLToPath(new URL('.', import.meta.url)) })],
    oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./apps/docs/src', import.meta.url)),
        'expo-audio': fileURLToPath(
          new URL('./apps/mobile/test/support/expo-audio.ts', import.meta.url),
        ),
        'react-native-webview': fileURLToPath(
          new URL('./apps/mobile/test/support/react-native-webview.ts', import.meta.url),
        ),
        '@deepseek-ai/dsh-api-gateway/client': fileURLToPath(
          new URL('./packages/client/test/support/gateway-client.ts', import.meta.url),
        ),
      },
    },
  };
}

const testDefaults = {
  testTimeout: 15_000,
  env: { DO_NOT_TRACK: '1' },
  include: [
    'packages/*/test/**/*.test.{ts,tsx}',
    'apps/docs/test/**/*.test.ts',
    'apps/mobile/test/**/*.test.ts',
    'apps/mobile/test/**/*.test.tsx',
    'scripts/test/**/*.test.mjs',
  ],
};

export default defineConfig({
  ...sourceOptions(),
  test: {
    ...testDefaults,
    projects: [
      {
        extends: false,
        ...sourceOptions(),
        test: {
          ...testDefaults,
          name: 'default',
          exclude: [...configDefaults.exclude, ...genuiBudgetTests],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: false,
        ...sourceOptions(),
        test: {
          ...testDefaults,
          name: 'genui-budgeted',
          include: genuiBudgetTests,
          maxWorkers: 1,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
