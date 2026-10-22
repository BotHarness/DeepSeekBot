import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';

export interface VideoPresentation {
  attemptId: string;
  presentedFrames: number;
  receivedFrames: number;
  renderedFrames: number;
  sampleMs: number;
  presentedFps: number;
  lastPresentedAgoMs: number;
}

export interface LocalComputerVideoProps extends ViewProps {
  attemptId: string;
  offer: string;
  enabled: boolean;
  onDescription(event: NativeSyntheticEvent<{ attemptId: string; sdp: string }>): void;
  onMediaState(event: NativeSyntheticEvent<{ attemptId: string; state: string; code: string }>): void;
  onPresentation(event: NativeSyntheticEvent<VideoPresentation>): void;
}

export const NativeLocalComputerVideo = requireOptionalNativeModule('LocalComputerVideo') === null
  ? undefined
  : requireNativeView<LocalComputerVideoProps>('LocalComputerVideo');
