import type {
  CallAudioOutputId,
  CallAudioRouteState,
  CallMicrophoneId,
} from '../../host/call-audio-route';

export interface CallAudioMenuProps {
  route: CallAudioRouteState;
  size: number;
  fill: string;
  ink: string;
  disabled: boolean;
  onOutput(output: CallAudioOutputId): void;
  onMicrophone(microphone: CallMicrophoneId): void;
  onMode?(music: boolean): void;
  voiceVolume?: number;
  onVoiceVolume?(): void;
}

export function CallAudioMenu(_props: CallAudioMenuProps) {
  return null;
}
