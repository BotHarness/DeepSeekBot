import { fileURLToPath } from 'node:url';
import {
  configDefaults,
  defineConfig,
  type UserWorkspaceConfig,
  type ViteUserConfig,
} from 'vitest/config';

import { stylexPlugin } from './scripts/stylex-plugin.mjs';

const genuiBudgetTests = [
  'packages/core/test/genui-vm.test.ts',
  'packages/core/test/genui-guest.test.ts',
  'packages/core/test/genui-execution-session.test.ts',
  'packages/core/test/genui-execution-worker.test.ts',
  'packages/client/test/genui-dom-mirror.test.ts',
];

const docsSiteTest = 'apps/docs/test/changelog-public-surfaces.test.ts';

const mobileTests = ['apps/mobile/test/**/*.test.ts', 'apps/mobile/test/**/*.test.tsx'];

const durableIntegrationTests = [
  'packages/core/test/bot-group-review-rounds.test.ts',
  'packages/core/test/channel-attachment-forwarding.test.ts',
];

const CI_WORKERS = 4;
const ciWorkerLimit = process.env.CI ? { maxWorkers: CI_WORKERS } : {};

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
    ...mobileTests,
    'scripts/test/**/*.test.mjs',
  ],
};

export const mobileTestProject = {
  extends: false,
  ...sourceOptions(),
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    ...testDefaults,
    name: 'mobile',
    include: mobileTests,
    pool: 'forks',
    env: { ...testDefaults.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
    ...ciWorkerLimit,
    sequence: { groupOrder: 0 },
  },
} satisfies UserWorkspaceConfig & { extends: false };

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
          exclude: [
            ...configDefaults.exclude,
            ...genuiBudgetTests,
            ...durableIntegrationTests,
            docsSiteTest,
            ...mobileTests,
          ],
          ...ciWorkerLimit,
          sequence: { groupOrder: 0 },
        },
      },
      mobileTestProject,
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
      {
        extends: false,
        ...sourceOptions(),
        test: {
          ...testDefaults,
          name: 'durable-integration',
          include: durableIntegrationTests,
          maxWorkers: 1,
          fileParallelism: false,
          sequence: { groupOrder: 4 },
        },
      },
      {
        extends: false,
        ...sourceOptions(),
        test: {
          ...testDefaults,
          name: 'docs-site',
          include: [docsSiteTest],
          sequence: { groupOrder: 3 },
        },
      },
    ],
  },
});
