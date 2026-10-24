const { IOSConfig, withInfoPlist, withFinalizedMod } = require('expo/config-plugins');
const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const chinese = require('./locales/zh-Hans.json');

module.exports = (config) => {
  const store = process.env.DEEPSEEKBOT_APP_VARIANT === 'store';
  const englishName = store ? 'Tobs' : 'Tobs Dev';
  const chineseName = store ? '托布' : '托布 Dev';
  config.locales = {
    ...config.locales,
    'zh-Hans': { ios: { ...chinese.ios, CFBundleDisplayName: chineseName } },
  };
  config.ios = {
    ...config.ios,
    infoPlist: { ...config.ios.infoPlist, CFBundleDisplayName: englishName },
  };
  config = withInfoPlist(config, (mod) => {
    mod.modResults.CFBundleDisplayName = englishName;
    for (const [key, value] of Object.entries(mod.modResults)) {
      if (key.endsWith('UsageDescription') && typeof value === 'string') {
        mod.modResults[key] = value
          .replaceAll('DeepSeekBot', 'Tobs')
          .replaceAll('$(PRODUCT_NAME)', englishName);
      }
    }
    return mod;
  });
  return withFinalizedMod(config, [
    'ios',
    async (mod) => {
      const project = IOSConfig.XcodeUtils.getPbxproj(mod.modRequest.projectRoot);
      const root = mod.modRequest.platformProjectRoot;
      const bundleId = mod.ios.bundleIdentifier;
      const configurations = project.pbxXCBuildConfigurationSection();
      const sharePaths = new Set();
      for (const entry of Object.values(configurations)) {
        const settings = entry.buildSettings;
        if (!settings) continue;
        const identifier = String(settings.PRODUCT_BUNDLE_IDENTIFIER ?? '').replaceAll('"', '');
        if (identifier !== `${bundleId}.expo-sharing-extension`) continue;
        settings.INFOPLIST_KEY_CFBundleDisplayName = JSON.stringify(englishName);
        sharePaths.add(String(settings.INFOPLIST_FILE).replaceAll('"', ''));
      }
      for (const relative of sharePaths) {
        const filename = path.resolve(root, relative);
        if (!filename.startsWith(`${root}${path.sep}`)) throw new Error('Invalid share plist path');
        const original = await readFile(filename, 'utf8');
        const displayKey = /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/u;
        if (!displayKey.test(original)) throw new Error('Sharing extension display name not found');
        await writeFile(filename, original.replace(displayKey, `$1${englishName}$2`));
      }
      if (sharePaths.size !== 1) throw new Error('Sharing extension target not found');
      const catalog = {
        sourceLanguage: 'en',
        strings: {
          CFBundleDisplayName: {
            localizations: Object.fromEntries(
              [
                ['en', englishName],
                ['zh-Hans', chineseName],
              ].map(([language, value]) => [
                language,
                { stringUnit: { state: 'translated', value } },
              ]),
            ),
          },
        },
        version: '1.0',
      };
      for (const [uuid, target] of Object.entries(project.pbxNativeTargetSection())) {
        const name = typeof target === 'object' ? String(target.name).replaceAll('"', '') : '';
        const directory =
          name === 'expo-sharing-extension'
            ? name
            : name === 'NotificationService'
              ? '.targets/NotificationService'
              : undefined;
        if (!directory) continue;
        const relative = `${directory}/InfoPlist.xcstrings`;
        await writeFile(path.join(root, relative), JSON.stringify(catalog, null, 2));
        const existing = project.hasFile(relative);
        if (existing) existing.lastKnownFileType = 'text.json.xcstrings';
        else
          project.addResourceFile(relative, {
            target: uuid,
            lastKnownFileType: 'text.json.xcstrings',
          });
      }
      await writeFile(project.filepath, project.writeSync());
      return mod;
    },
  ]);
};
