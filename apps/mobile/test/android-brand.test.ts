import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
