import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it, afterEach, vi } from 'vitest';

const require = createRequire(import.meta.url);
afterEach(() => vi.unstubAllEnvs());

describe('mobile release identity', () => {
  it('uses the formal app identity for store-test without changing the development identity', async () => {
    const configure = require('../../apps/mobile/app.config.js');
    const config = JSON.parse(
      readFileSync(new URL('../../apps/mobile/app.json', import.meta.url)),
    ).expo;
    vi.stubEnv('DEEPSEEKBOT_APP_VARIANT', 'store');
    const store = configure({ config });
    expect(store.name).toBe('DeepSeekBot');
    expect(store.ios.bundleIdentifier).toBe('app.deepseekbot.mobile');
    expect(store.android.package).toBe('app.deepseekbot.mobile');
    expect(store.extra.eas.projectId).toBe('40cf3888-5864-4238-9cfb-82e285d568f6');
    expect(store.updates.enabled).toBe(false);
    vi.stubEnv('DEEPSEEKBOT_APP_VARIANT', '');
    expect(configure({ config }).ios.bundleIdentifier).toBe('ai.botharness.deepseekbot.dev');
    const eas = JSON.parse(readFileSync(new URL('../../apps/mobile/eas.json', import.meta.url)));
    expect(eas.build['store-test']).toMatchObject({
      env: { DEEPSEEKBOT_APP_VARIANT: 'store' },
      distribution: 'store',
      developmentClient: false,
      android: { buildType: 'app-bundle' },
    });
    expect(eas.submit['store-test'].android).toEqual({ track: 'internal', releaseStatus: 'draft' });
  });
});
