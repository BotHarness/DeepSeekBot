const { withPodfile } = require('expo/config-plugins');

module.exports = (config) =>
  withPodfile(config, (mod) => {
    const declaration = "ENV['RCT_USE_PREBUILT_RNCORE'] = '0'";
    if (!mod.modResults.contents.includes(declaration)) {
      mod.modResults.contents = `${declaration}\n${mod.modResults.contents}`;
    }
    return mod;
  });
