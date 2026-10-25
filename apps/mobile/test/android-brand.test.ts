import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const brand = require('../with-android-brand.js');
const { AndroidConfig } = require('expo/config-plugins');
afterEach(() => vi.unstubAllEnvs());

it.each([
  ['store', 'Tobs', '托布'],
  ['development', 'Tobs Dev', '托布 Dev'],
])(
  'generates Android launcher labels for %s without changing installation identity',
  async (variant, en, zh) => {
    vi.stubEnv('DEEPSEEKBOT_APP_VARIANT', variant);
    const root = mkdtempSync(join(tmpdir(), 'tobs-android-brand-'));
    try {
      const config = {
        name: 'DeepSeekBot',
        slug: 'deepseekbot',
        scheme: ['deepseekbot', 'app.deepseekbot.mobile'],
        android: { package: 'app.deepseekbot.mobile' },
        ios: { bundleIdentifier: 'app.deepseekbot.mobile' },
      };
      const compiled = AndroidConfig.Name.withName(brand(structuredClone(config)));
      const result = await compiled.mods.android.strings({
        ...compiled,
        modRequest: { platformProjectRoot: root, projectRoot: root },
        modResults: { resources: { string: [{ $: { name: 'unrelated' }, _: 'preserved' }] } },
      });
      expect(result.modResults.resources.string).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ $: expect.objectContaining({ name: 'app_name' }), _: en }),
          { $: { name: 'unrelated' }, _: 'preserved' },
        ]),
      );
      await compiled.mods.android.dangerous({
        ...compiled,
        modRequest: { platformProjectRoot: root, projectRoot: root },
      });
      expect(
        readFileSync(join(root, 'app/src/main/res/values-b+zh+Hans/tobs-brand.xml'), 'utf8'),
      ).toContain(`>${zh}</string>`);
      expect(result.android).toEqual(config.android);
      expect(result.ios).toEqual(config.ios);
      expect(result.scheme).toEqual(config.scheme);
      expect(result.name).toBe(config.name);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

it('retains pairing and sharing routes when an alternate launcher disables MainActivity', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tobs-android-entry-'));
  const filename = join(root, 'app/src/main/AndroidManifest.xml');
  mkdirSync(join(root, 'app/src/main'), { recursive: true });
  const launcher = {
    action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
    category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
  };
  const routes = ['VIEW', 'SEND', 'SEND_MULTIPLE'].map((action) => ({
    action: [{ $: { 'android:name': `android.intent.action.${action}` } }],
    category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
    data: [
      {
        $:
          action === 'VIEW'
            ? { 'android:scheme': 'deepseekbot-dev' }
            : { 'android:mimeType': 'text/plain' },
      },
    ],
  }));
  try {
    await AndroidConfig.Manifest.writeAndroidManifestAsync(filename, {
      manifest: {
        $: {
          'xmlns:android': 'http://schemas.android.com/apk/res/android',
          package: 'ai.botharness.deepseekbot.dev',
        },
        application: [
          {
            $: { 'android:name': '.MainApplication' },
            activity: [
              {
                $: { 'android:name': '.MainActivity', 'android:exported': 'true' },
                'intent-filter': [launcher, ...routes],
              },
            ],
            'activity-alias': [
              {
                $: {
                  'android:name': '.MainActivityDeepSeekBotSimple',
                  'android:targetActivity': '.MainActivity',
                  'android:enabled': 'false',
                  'android:exported': 'true',
                },
                'intent-filter': [launcher],
              },
            ],
          },
        ],
      },
    });
    const config = brand({ name: 'Tobs', slug: 'deepseekbot' });
    const run = () =>
      config.mods.android.finalized({
        ...config,
        modRequest: { platformProjectRoot: root, projectRoot: root },
      });
    await run();
    const first = readFileSync(filename, 'utf8');
    await run();
    expect(readFileSync(filename, 'utf8')).toBe(first);
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      await AndroidConfig.Manifest.readAndroidManifestAsync(filename),
    );
    const alias = application['activity-alias'][0];
    expect(alias['intent-filter']).toEqual([launcher, ...routes]);
    expect(alias.$['android:name']).toBe('.MainActivityDeepSeekBotSimple');
    expect(alias.$['android:enabled']).toBe('false');
    expect(application.activity[0]['intent-filter']).toEqual([launcher, ...routes]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
