import type { CallClientMedia } from '../../../../packages/core/src/voice/call-client';

export const callMediaSupported = false;

export type MicrophoneAccess = 'granted' | 'denied' | 'blocked';

export async function microphoneAccess(): Promise<MicrophoneAccess> {
  return 'denied';
}

export interface CallTestAudio {
  inject(path: string): Promise<boolean>;
  onTap(listener: (event: { attemptId: string; kind: string }) => void): () => void;
  recording(): string | null;
}

export function createCallMedia(
  _options: { testAudio?: boolean } = {},
): (CallClientMedia & { test?: CallTestAudio }) | undefined {
  return undefined;
}
