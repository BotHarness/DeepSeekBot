export interface ChannelMessageVoice {
  state: 'pending' | 'ready' | 'failed';
  attachment?: string;
  durationMs?: number;
  code?: string;
  error?: string;
}

const VOICE_STATES = new Set(['pending', 'ready', 'failed']);

export function isChannelMessageVoice(value: unknown): value is ChannelMessageVoice {
  if (typeof value !== 'object' || value === null) return false;
  const voice = value as Record<string, unknown>;
  return (
    VOICE_STATES.has(voice['state'] as string) &&
    (voice['attachment'] === undefined ||
      (typeof voice['attachment'] === 'string' && voice['attachment'].length <= 200)) &&
    (voice['durationMs'] === undefined ||
      (Number.isSafeInteger(voice['durationMs']) && (voice['durationMs'] as number) >= 0)) &&
    (voice['code'] === undefined ||
      (typeof voice['code'] === 'string' && voice['code'].length <= 64)) &&
    (voice['error'] === undefined ||
      (typeof voice['error'] === 'string' && voice['error'].length <= 300)) &&
    (voice['state'] !== 'ready' || typeof voice['attachment'] === 'string')
  );
}
