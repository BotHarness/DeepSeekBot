import { createRequire } from 'node:module';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const plugin = require('../modules/local-computer-video/app.plugin.js');
const activity =
  'class MainActivity : ReactActivity() {\n  override fun getMainComponentName(): String = "main"\n}\n';
const generate = async (manifest: unknown, contents = activity) => {
  const config = plugin({
    name: 'Tobs',
    slug: 'tobs',
    mods: { android: { manifest: (mod: unknown) => mod, mainActivity: (mod: unknown) => mod } },
  });
  const base = { ...config, modRequest: { platform: 'android', projectRoot: '/qa/mobile' } };
  const manifestResult = await config.mods.android.manifest({ ...base, modResults: manifest });
  const activityResult = await config.mods.android.mainActivity({
    ...base,
    modResults: { language: 'kt', contents },
  });
  return { manifest: manifestResult.modResults, contents: activityResult.modResults.contents };
};
const manifest = () => ({
  manifest: {
    application: [
      {
        $: {},
        activity: [
          {
            $: {
              'android:name': '.MainActivity',
              'android:configChanges': 'orientation|uiMode|locale',
            },
            'intent-filter': [
              {
                action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
                category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
              },
            ],
          },
        ],
      },
    ],
  },
});

it('keeps the call-owning activity on font changes without dropping existing configuration handling', async () => {
  const result = await generate(manifest());
  expect(
    result.manifest.manifest.application[0].activity[0].$['android:configChanges'].split('|'),
  ).toEqual(['orientation', 'uiMode', 'locale', 'fontScale']);
  expect(result.contents).toContain('super.onConfigurationChanged(newConfig)');
  expect(result.contents).toContain(
    'getNativeModule(com.facebook.react.modules.deviceinfo.DeviceInfoModule::class.java)?.onHostResume()',
  );
  expect(await generate(result.manifest, result.contents)).toEqual(result);
});

it('refuses an unsupported activity template rather than claiming text scaling remains live', async () => {
  await expect(generate(manifest(), 'class ChangedActivity {}')).rejects.toThrow('MainActivity');
});
