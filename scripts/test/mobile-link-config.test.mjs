import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import configure from '../../apps/mobile/app.config.js';
import app from '../../apps/mobile/app.json';

const mobile = fileURLToPath(new URL('../../apps/mobile/', import.meta.url));
const require = createRequire(new URL('../../apps/mobile/package.json', import.meta.url));
const cli = require.resolve('expo/bin/cli');

function finalConfig(variant) {
  return JSON.parse(
    execFileSync(process.execPath, [cli, 'config', '--type', 'introspect', '--json'], {
      cwd: mobile,
      env: {
        ...process.env,
        EXPO_OFFLINE: '1',
        EXPO_NO_TELEMETRY: '1',
        DEEPSEEKBOT_APP_VARIANT: variant,
      },
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    }),
  );
}

function schemes(config, platform) {
  const mods = config._internal.modResults;
  if (platform === 'ios')
    return [
      ...new Set(mods.ios.infoPlist.CFBundleURLTypes.flatMap((type) => type.CFBundleURLSchemes)),
    ].sort();
  return [
    ...new Set(
      mods.android.manifest.manifest.application
        .flatMap((app) => app.activity ?? [])
        .flatMap((activity) => activity['intent-filter'] ?? [])
        .flatMap((filter) => filter.data ?? [])
        .flatMap((data) => data.$['android:scheme'] ?? []),
    ),
  ].sort();
}

describe('mobile build variant links', () => {
  it('registers disjoint final iOS and Android schemes without changing application identity', () => {
    expect(configure).toBeTypeOf('function');
    expect(app.expo.slug).toBe('deepseekbot');
    const dev = finalConfig('development');
    const store = finalConfig('store');
    for (const platform of ['ios', 'android']) {
      expect(schemes(dev, platform)).toEqual([
        'ai.botharness.deepseekbot.dev',
        'deepseekbot-dev',
        'exp+deepseekbot',
      ]);
      expect(schemes(store, platform)).toEqual(['app.deepseekbot.mobile', 'deepseekbot']);
    }
    for (const [config, id] of [
      [dev, 'ai.botharness.deepseekbot.dev'],
      [store, 'app.deepseekbot.mobile'],
    ]) {
      expect(config.ios.bundleIdentifier).toBe(id);
      expect(config.android.package).toBe(id);
      expect(config.ios.entitlements['com.apple.security.application-groups']).toEqual([
        `group.${id}`,
      ]);
      expect(schemes(config, 'ios')).toContain(id);
      expect(config.updates.enabled).toBe(false);
    }
  });
});
