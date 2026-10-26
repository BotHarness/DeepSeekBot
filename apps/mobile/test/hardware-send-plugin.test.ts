import { createRequire } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const withHardwareSendTests = require('../modules/hardware-send/app.plugin.js');
const podfile = `platform :ios, '16.4'
target 'Tobs' do
  use_expo_modules!
  use_react_native!
end
`;
const declaration =
  "  pod 'HardwareSend', :path => '../modules/hardware-send/ios', :testspecs => ['Tests']";

const generate = async (contents: string) => {
  const config = withHardwareSendTests({
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

afterEach(() => vi.unstubAllEnvs());

it('leaves normal app configuration untouched without the native test opt-in', () => {
  vi.stubEnv('BOTHARNESS_HARDWARE_SEND_IOS_TESTS', undefined);
  const config = {
    name: 'Tobs',
    slug: 'tobs',
    ios: { bundleIdentifier: 'app.deepseekbot.mobile' },
  };
  expect(withHardwareSendTests(config)).toBe(config);
});

it('adds only the requested test spec before Expo autolinking and remains idempotent', async () => {
  vi.stubEnv('BOTHARNESS_HARDWARE_SEND_IOS_TESTS', '1');
  const generated = await generate(podfile);
  expect(generated).toBe(
    podfile.replace('  use_expo_modules!', `${declaration}\n  use_expo_modules!`),
  );
  expect(await generate(generated)).toBe(generated);
});

it('refuses an unfamiliar Podfile instead of silently omitting the test target', async () => {
  vi.stubEnv('BOTHARNESS_HARDWARE_SEND_IOS_TESTS', '1');
  await expect(generate("target 'Tobs' do\nend\n")).rejects.toThrow('use_expo_modules!');
});
