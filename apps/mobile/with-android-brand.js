const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const {
  AndroidConfig,
  withStringsXml,
  withDangerousMod,
  withFinalizedMod,
} = require('expo/config-plugins');

module.exports = (config) => {
  const store = process.env.DEEPSEEKBOT_APP_VARIANT === 'store';
  config = withStringsXml(config, (mod) => {
    mod.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: 'app_name', translatable: 'false' }, _: store ? 'Tobs' : 'Tobs Dev' }],
      mod.modResults,
    );
    return mod;
  });
  config = withDangerousMod(config, [
    'android',
    (mod) => {
      const directory = join(
        mod.modRequest.platformProjectRoot,
        'app/src/main/res/values-b+zh+Hans',
      );
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, 'tobs-brand.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<resources><string name="app_name">${store ? '托布' : '托布 Dev'}</string></resources>\n`,
      );
      return mod;
    },
  ]);
  return withFinalizedMod(config, [
    'android',
    async (mod) => {
      const filename = join(mod.modRequest.platformProjectRoot, 'app/src/main/AndroidManifest.xml');
      const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(filename);
      const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
      const main = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
      const entryFilters = (main['intent-filter'] ?? []).filter((filter) =>
        filter.action?.some((action) =>
          [
            'android.intent.action.VIEW',
            'android.intent.action.SEND',
            'android.intent.action.SEND_MULTIPLE',
          ].includes(action.$['android:name']),
        ),
      );
      for (const alias of application['activity-alias'] ?? []) {
        if (alias.$['android:targetActivity'] !== main.$['android:name']) continue;
        const filters = alias['intent-filter'] ?? [];
        const existing = new Set(filters.map((filter) => JSON.stringify(filter)));
        alias['intent-filter'] = [
          ...filters,
          ...entryFilters
            .filter((filter) => !existing.has(JSON.stringify(filter)))
            .map((filter) => structuredClone(filter)),
        ];
      }
      await AndroidConfig.Manifest.writeAndroidManifestAsync(filename, manifest);
      return mod;
    },
  ]);
};
