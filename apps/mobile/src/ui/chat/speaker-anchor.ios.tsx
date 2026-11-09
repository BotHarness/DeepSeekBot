import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ViewProps } from 'react-native';

export const SpeakerAnchor =
  process.env.EXPO_PUBLIC_STICKY_AVATAR !== 'reanimated' &&
  requireOptionalNativeModule('SpeakerAnchor')
    ? requireNativeView<
        ViewProps & { rest: number; span: number; floor: number; viewport: string }
      >('SpeakerAnchor')
    : undefined;
