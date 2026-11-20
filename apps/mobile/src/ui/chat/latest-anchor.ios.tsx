import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ViewProps } from 'react-native';

export const LatestAnchor =
  process.env.EXPO_PUBLIC_FOLLOW_LATEST !== 'js' && requireOptionalNativeModule('LatestAnchor')
    ? requireNativeView<ViewProps & { following: boolean; animated: boolean }>('LatestAnchor')
    : undefined;
