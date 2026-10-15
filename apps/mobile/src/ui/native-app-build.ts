import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { AppBuild } from './app-build';

// Metro inlines EXPO_PUBLIC_BUILD_* when it bundles (see metro.config.js), so the commit names
// the JavaScript that is running, which is what a test build is told apart by.
export function currentAppBuild(): AppBuild {
  const config = Constants.expoConfig;
  const buildNumber =
    Platform.OS === 'android' ? config?.android?.versionCode : config?.ios?.buildNumber;
  return {
    version: config?.version,
    buildNumber: buildNumber === undefined ? undefined : String(buildNumber),
    commit: process.env.EXPO_PUBLIC_BUILD_COMMIT,
    branch: process.env.EXPO_PUBLIC_BUILD_BRANCH,
  };
}
