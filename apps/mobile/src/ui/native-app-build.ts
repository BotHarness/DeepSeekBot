import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { AppBuild } from './app-build';

export function currentAppBuild(): AppBuild {
  const config = Constants.expoConfig;
  const buildNumber =
    Platform.OS === 'android' ? config?.android?.versionCode : config?.ios?.buildNumber;
  return {
    version: config?.version,
    buildNumber: buildNumber === undefined ? undefined : String(buildNumber),
    commit: process.env.EXPO_PUBLIC_BUILD_COMMIT,
    time: process.env.EXPO_PUBLIC_BUILD_TIME,
    branch: process.env.EXPO_PUBLIC_BUILD_BRANCH,
  };
}
