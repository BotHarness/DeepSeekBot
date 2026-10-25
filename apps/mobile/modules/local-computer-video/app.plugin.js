const { withPodfile } = require('expo/config-plugins');
module.exports = (config) =>
  withPodfile(config, (mod) => {
    const line =
      "  pod 'WebRTC-SDK', :podspec => File.join(__dir__, '../modules/local-computer-video/vendor/WebRTC-SDK.podspec')";
    if (!mod.modResults.contents.includes(line)) {
      mod.modResults.contents = mod.modResults.contents.replace(
        '  use_expo_modules!',
        '  use_expo_modules!\n' + line,
      );
    }
    return mod;
  });
