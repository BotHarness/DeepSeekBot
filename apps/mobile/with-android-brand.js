const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { AndroidConfig, withStringsXml, withDangerousMod } = require('expo/config-plugins');

module.exports = (config) => {
  const store = process.env.DEEPSEEKBOT_APP_VARIANT === 'store';
  config = withStringsXml(config, (mod) => {
    mod.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: 'app_name', translatable: 'false' }, _: store ? 'Tobs' : 'Tobs Dev' }],
      mod.modResults,
    );
    return mod;
  });
  return withDangerousMod(config, [
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
};
