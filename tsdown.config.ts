import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type UserConfig } from 'tsdown';

import { preparePackagedDesktopZoomTheme } from './scripts/desktop-zoom-compat.mjs';
import { dockviewCssPlugin } from './scripts/dockview-css-plugin.mjs';
import { stylexPlugin } from './scripts/stylex-plugin.mjs';

const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url));

const CLIENT_ID = '@botharness/ui';

const PLATFORM_MODULES = [
  /^react$/,
  /^react\/jsx-runtime$/,
  /^react\/jsx-dev-runtime$/,
  /^react-dom$/,
  /^react-dom\/client$/,
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
  '@deepseek-ai/dsh-api-gateway/client',
];

function clientBundle(id: string, entry: string[], outDir: string): UserConfig {
  return {
    entry,
    outDir,
    format: ['cjs'],
    platform: 'browser',
    inputOptions: { resolve: { conditionNames: ['browser', 'import', 'default'] } },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    dts: false,
    clean: true,
    sourcemap: true,
    external: PLATFORM_MODULES,
    plugins: [
      {
        name: 'botharness:vfile-browser-imports',
        resolveId(id, importer) {
          if (
            /^#min(?:path|proc|url)$/u.test(id) &&
            importer?.replaceAll('\\', '/').includes('/node_modules/vfile/lib/')
          )
            return join(dirname(importer), `${id.slice(1)}.browser.js`);
          return null;
        },
      },
      stylexPlugin({ rootDir: ROOT_DIR }),
      dockviewCssPlugin({ rootDir: ROOT_DIR }),
    ],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({
  id: '${id}',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;`,
      footer: `    return module.exports;
  },
});`,
    },
  };
}

export const CLIENT_BUNDLE_OUT_DIR = 'packages/client/lib';

export function buildStamp(env: NodeJS.ProcessEnv = process.env): { sha: string; time: string } {
  let sha = env['BOTHARNESS_BUILD_SHA']?.trim();
  if (!sha) {
    try {
      sha = execFileSync('git', ['rev-parse', '--short=9', 'HEAD'], {
        cwd: ROOT_DIR,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
    } catch {
      sha = undefined;
    }
  }
  return {
    sha: sha || 'dev',
    time: env['BOTHARNESS_BUILD_TIME']?.trim() || new Date().toISOString(),
  };
}

const clientBase = clientBundle(
  CLIENT_ID,
  ['packages/client/src/client/index.ts'],
  CLIENT_BUNDLE_OUT_DIR,
);

export const clientBundleOptions: UserConfig = {
  ...clientBase,
  define: { ...clientBase.define, __BOTHARNESS_BUILD__: JSON.stringify(buildStamp()) },
};

export const computerClientBundleOptions: UserConfig = clientBundle(
  '@botharness/computer',
  ['packages/computer/src/client/index.tsx'],
  'packages/computer/lib',
);

export const browserClientBundleOptions: UserConfig = clientBundle(
  '@botharness/browser',
  ['packages/browser/src/client/index.tsx'],
  'packages/browser/lib',
);

export const coreCliBundleOptions: UserConfig = {
  entry: { index: 'packages/core/src/bots/bot-create-cli.ts' },
  outDir: 'packages/core/cli',
  format: ['esm'],
  platform: 'node',
  dts: false,
  clean: true,
  external: ['@resvg/resvg-js', 'silk-wasm', 'css-tree'],
  deps: { alwaysBundle: [/^@deepseek-ai\//] },
};

function sourceBuildStamp(): { revision: string; dirty: boolean } | null {
  try {
    const git = (args: string[]): string =>
      execFileSync('git', args, {
        cwd: ROOT_DIR,
        encoding: 'utf8',
        timeout: 2_000,
        maxBuffer: 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    return {
      revision: git(['rev-parse', 'HEAD']),
      dirty: git(['status', '--porcelain', '--untracked-files=normal']).length > 0,
    };
  } catch {
    return null;
  }
}

function roomAsset(name: string) {
  const directory = join(ROOT_DIR, 'packages/vrm-companion/assets/kaykit');
  const model = JSON.parse(readFileSync(join(directory, name + '.gltf'), 'utf8'));
  for (const buffer of model.buffers)
    buffer.uri =
      'data:application/octet-stream;base64,' +
      readFileSync(join(directory, buffer.uri)).toString('base64');
  for (const image of model.images)
    image.uri =
      'data:image/png;base64,' + readFileSync(join(directory, image.uri)).toString('base64');
  return 'data:model/gltf+json;base64,' + Buffer.from(JSON.stringify(model)).toString('base64');
}

const vrmCompanionClient = clientBundle(
  '@botharness/vrm-companion',
  ['packages/vrm-companion/src/client/index.tsx'],
  'packages/vrm-companion/lib',
);

export const vrmCompanionClientBundleOptions: UserConfig = {
  ...vrmCompanionClient,
  plugins: [
    ...(vrmCompanionClient.plugins as unknown[]),
    {
      name: 'botharness:vrm-default-model-chunk',
      generateBundle() {
        const url =
          'data:model/gltf-binary;base64,' +
          readFileSync(
            join(ROOT_DIR, 'packages/vrm-companion/assets/avatar-sample-a.vrm'),
          ).toString('base64');
        this.emitFile({
          type: 'asset',
          fileName: 'client.model.js',
          source: `window.__ModuleLoader__.load({ id: '@botharness/vrm-companion/client.model.js', factory: () => ({ url: ${JSON.stringify(url)} }) });\n`,
        });
      },
    },
  ] as UserConfig['plugins'],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __ROOM_ASSETS__: JSON.stringify(
      Object.fromEntries(
        [
          'book_set',
          'shelf_B_small_decorated',
          'cactus_small_A',
          'cactus_medium_A',
          'pictureframe_small_A',
          'pillow_A',
          'book_single',
        ].map((name) => [name, roomAsset(name)]),
      ),
    ),
  },
};

export default defineConfig([
  {
    entry: ['packages/core/src/index.ts'],
    outDir: 'packages/core/dist',
    define: { __BOTHARNESS_SOURCE__: JSON.stringify(sourceBuildStamp()) },
    format: ['esm'],
    platform: 'node',
    dts: true,
    clean: true,
    external: [
      '@resvg/resvg-js',
      'silk-wasm',
      'css-tree',
      '@deepseek-ai/dsh-agent',
      '@deepseek-ai/dsh-llm',
      '@deepseek-ai/dsh-session',
      '@deepseek-ai/dsh-tools',
      '@deepseek-ai/dsh-scope',
      '@deepseek-ai/dsh-subagent',
      '@deepseek-ai/dsh-tool-bash',
      '@deepseek-ai/dsh-tool-pwsh',
    ],
  },
  coreCliBundleOptions,
  {
    entry: ['packages/client/src/index.ts', 'packages/client/src/panel-api.ts'],
    outDir: 'packages/client/dist',
    format: ['esm'],
    platform: 'node',
    dts: true,
    clean: true,
  },
  {
    entry: ['packages/computer/src/index.ts'],
    outDir: 'packages/computer/dist',
    format: ['esm'],
    platform: 'node',
    dts: true,
    clean: true,
    external: ['sharp'],
  },
  {
    entry: {
      index: 'packages/browser/src/index.ts',
      'daily-worker': 'packages/browser/src/daily-worker.ts',
    },
    outDir: 'packages/browser/dist',
    format: ['esm'],
    platform: 'node',
    dts: true,
    clean: true,
  },
  {
    entry: ['packages/todo/src/index.ts'],
    outDir: 'packages/todo/dist',
    format: ['esm'],
    platform: 'node',
    dts: true,
    clean: true,
    external: ['@deepseek-ai/dsh-tools'],
  },
  {
    entry: { 'bh-links': 'packages/links-cli/src/main.ts' },
    outDir: 'packages/links-cli/dist',
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    dts: false,
    clean: true,
    outputOptions: { banner: '#!/usr/bin/env node' },
  },
  clientBundleOptions,
  {
    entry: {
      'profile-cli': 'packages/deepseekbot/src/profile-cli.mjs',
      'desktop-zoom-setup': 'packages/deepseekbot/src/desktop-zoom-setup.mjs',
      deepseekbot: 'packages/deepseekbot/src/deepseekbot.mjs',
      'theme-schema': 'packages/client/src/theme-schema.ts',
    },
    deps: { alwaysBundle: ['@deepseek-ai/schemastery'] },
    onSuccess: () => {
      preparePackagedDesktopZoomTheme({
        source: join(ROOT_DIR, 'packages/client/node_modules/@deepseek-ai/dsh-client-ui-theme'),
        target: join(ROOT_DIR, 'packages/deepseekbot/desktop-theme'),
      });
    },
    outDir: 'packages/deepseekbot/dist',
    format: ['esm'],
    platform: 'node',
    dts: false,
    clean: true,
    external: ['@botharness/core'],
    outputOptions: { banner: '#!/usr/bin/env node' },
  },
  computerClientBundleOptions,
  browserClientBundleOptions,
  {
    entry: ['packages/vrm-companion/src/index.ts'],
    outDir: 'packages/vrm-companion/dist',
    format: ['esm'],
    platform: 'node',
    dts: true,
    clean: true,
  },
  vrmCompanionClientBundleOptions,
]);
