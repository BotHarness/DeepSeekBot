const {
  AndroidConfig,
  withAndroidManifest,
  withMainActivity,
  withInfoPlist,
  withPodfile,
} = require('expo/config-plugins');

const withCallFontConfiguration = (config) => {
  config = withAndroidManifest(config, (mod) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    const changes = new Set((activity.$['android:configChanges'] ?? '').split('|').filter(Boolean));
    changes.add('fontScale');
    activity.$['android:configChanges'] = [...changes].join('|');
    return mod;
  });
  return withMainActivity(config, (mod) => {
    const marker = '// Bot call font configuration';
    if (mod.modResults.contents.includes(marker)) return mod;
    const anchor = 'class MainActivity : ReactActivity() {';
    if (
      mod.modResults.language !== 'kt' ||
      !mod.modResults.contents.includes(anchor) ||
      mod.modResults.contents.includes('override fun onConfigurationChanged(')
    ) {
      throw new Error('Call font configuration requires the Kotlin MainActivity template');
    }
    const callback = `
  ${marker}
  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    // RN refreshes native text layout above; also refresh JS Dimensions while foregrounded.
    val deviceInfo = (application as com.facebook.react.ReactApplication).reactHost?.currentReactContext
      ?.getNativeModule("DeviceInfo")
    (deviceInfo as? com.facebook.react.bridge.LifecycleEventListener)?.onHostResume()
  }
`;
    mod.modResults.contents = mod.modResults.contents.replace(anchor, anchor + callback);
    return mod;
  });
};

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

module.exports = (config) =>
  withCallFontConfiguration(withCallBackgroundAudio(withWebRtcPod(config)));
