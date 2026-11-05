const { withInfoPlist, withPodfile } = require('expo/config-plugins');

const withCallBackgroundAudio = (config) =>
  withInfoPlist(config, (mod) => {
    const modes = Array.isArray(mod.modResults.UIBackgroundModes)
      ? mod.modResults.UIBackgroundModes
      : [];
    if (!modes.includes('audio')) modes.push('audio');
    mod.modResults.UIBackgroundModes = modes;
    return mod;
  });

const withWebRtcPod = (config) =>
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

module.exports = (config) => withCallBackgroundAudio(withWebRtcPod(config));
