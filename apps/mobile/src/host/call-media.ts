import type { CallClientMedia } from '../../../../packages/core/src/voice/call-client';
import type { CallAudioControl, CallAudioRoute } from './call-audio-route';

export const callMediaSupported = false;

export type MicrophoneAccess = 'granted' | 'denied' | 'blocked';

export async function microphoneGranted(): Promise<boolean> {
  return false;
}

export async function microphoneAccess(): Promise<MicrophoneAccess> {
  return 'denied';
}

export interface CallTestAudio {
  inject(path: string): Promise<boolean>;
  onTap(listener: (event: { attemptId: string; kind: string }) => void): () => void;
  recording(): string | null;
}

export function createCallMedia(
  _options: { testAudio?: boolean; route?: () => CallAudioRoute } = {},
): (CallClientMedia & { audio?: CallAudioControl; test?: CallTestAudio }) | undefined {
  return undefined;
}
