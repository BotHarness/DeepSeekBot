const { withPodfile } = require('expo/config-plugins');

module.exports = (config) => {
  if (process.env.BOTHARNESS_HARDWARE_SEND_IOS_TESTS !== '1') return config;
  return withPodfile(config, (mod) => {
    const declaration =
      "  pod 'HardwareSend', :path => '../modules/hardware-send/ios', :testspecs => ['Tests']";
    const anchor = '  use_expo_modules!';
    if (mod.modResults.contents.includes(declaration)) return mod;
    if (!mod.modResults.contents.includes(anchor)) {
      throw new Error('HardwareSend tests require a Podfile with use_expo_modules!');
    }
    mod.modResults.contents = mod.modResults.contents.replace(anchor, `${declaration}\n${anchor}`);
    return mod;
  });
};
