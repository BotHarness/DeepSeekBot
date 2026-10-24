import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import { productName as androidName } from '../src/ui/product-name';
import { productName as iosName } from '../src/ui/product-name.ios';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const withIosBrand = require('./with-ios-brand');

afterEach(() => vi.unstubAllEnvs());

it.each([
  ['store', 'Tobs', '托布', 'app.deepseekbot.mobile', ['deepseekbot', 'app.deepseekbot.mobile']],
  [
    'development',
    'Tobs Dev',
    '托布 Dev',
    'ai.botharness.deepseekbot.dev',
    ['deepseekbot-dev', 'ai.botharness.deepseekbot.dev'],
  ],
])(
  'resolves %s iOS display copy while keeping upgrade and link identities',
  (variant, english, chinese, bundleId, schemes) => {
    const config = JSON.parse(
      execFileSync(
        process.execPath,
        [require.resolve('expo/bin/cli'), 'config', '--type', 'introspect', '--json'],
        {
          cwd: root,
          env: { ...process.env, DEEPSEEKBOT_APP_VARIANT: variant, EXPO_NO_TELEMETRY: '1' },
          encoding: 'utf8',
        },
      ),
    );
    const native = config._internal.modResults.ios;
    expect(native.infoPlist.CFBundleDisplayName).toBe(english);
    for (const key of [
      'NSCameraUsageDescription',
      'NSMicrophoneUsageDescription',
      'NSPhotoLibraryUsageDescription',
      'NSSpeechRecognitionUsageDescription',
      'NSLocalNetworkUsageDescription',
    ]) {
      expect(native.infoPlist[key]).toContain('Tobs');
      expect(config.locales['zh-Hans'].ios[key]).toContain('托布');
    }
    expect(config.locales['zh-Hans'].ios.CFBundleDisplayName).toBe(chinese);
    expect(config.ios.bundleIdentifier).toBe(bundleId);
    expect(config.scheme).toEqual(schemes);
    expect(config.ios.entitlements['com.apple.security.application-groups']).toEqual([
      `group.${bundleId}`,
    ]);
    expect(config.extra.eas.projectId).toBe('40cf3888-5864-4238-9cfb-82e285d568f6');
    expect(
      config.plugins.find(
        (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-alternate-app-icons',
      )[1][0].name,
    ).toBe('DeepSeekBotSimple');
  },
);

it('leaves Android native configuration and existing locale entries under their own owner', () => {
  const android = { package: 'app.deepseekbot.mobile' };
  const androidMods = {};
  const config = withIosBrand({
    name: 'DeepSeekBot',
    ios: { bundleIdentifier: 'app.deepseekbot.mobile' },
    android,
    mods: { android: androidMods },
    locales: { en: { android: { app_name: 'Existing Android name' } } },
  });
  expect(config.android).toBe(android);
  expect(config.mods.android).toBe(androidMods);
  expect(config.locales.en).toEqual({ android: { app_name: 'Existing Android name' } });
  expect(androidName).toEqual({ en: 'DeepSeekBot', zh: 'DeepSeekBot' });
  expect(iosName).toEqual({ en: 'Tobs', zh: '托布' });
});
