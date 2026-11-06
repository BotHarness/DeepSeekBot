import { createRequire } from 'node:module';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const withSchedulerLifetime = require('../with-scheduler-lifetime.js');
const generate = async (contents: string) => {
  const config = withSchedulerLifetime({
    name: 'Tobs',
    slug: 'tobs',
    mods: { ios: { podfile: (mod: unknown) => mod } },
  });
  const result = await config.mods.ios.podfile({
    ...config,
    modRequest: { platform: 'ios', modName: 'podfile', projectRoot: '/qa/mobile' },
    modResults: { path: '/qa/mobile/ios/Podfile', language: 'ruby', contents },
  });
  return result.modResults.contents;
};

it('builds the patched React Native source instead of downloading an unpatched framework', async () => {
  const original = "ENV['RCT_USE_PREBUILT_RNCORE'] ||= '1'\nuse_react_native!\n";
  const generated = await generate(original);
  expect(generated).toBe("ENV['RCT_USE_PREBUILT_RNCORE'] = '0'\n" + original);
  expect(await generate(generated)).toBe(generated);
});
