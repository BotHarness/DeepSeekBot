import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ViewProps } from 'react-native';

export type SpeakerAnchorProps = ViewProps & {
  rest: number;
  span: number;
  floor: number;
  viewport: string;
};

export const SPEAKER_VIEWPORT = 'chat-speaker-viewport';

export const SpeakerAnchor =
  process.env.EXPO_PUBLIC_STICKY_AVATAR !== 'reanimated' &&
  requireOptionalNativeModule('SpeakerAnchor')
    ? requireNativeView<SpeakerAnchorProps>('SpeakerAnchor')
    : undefined;
