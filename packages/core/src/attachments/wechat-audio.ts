import { MessagingError, type MessagingVoice } from '../messaging/provider.js';
import { decodeSilkVoice } from './voice-audio.js';
export { MAX_VOICE_INPUT_BYTES, MAX_VOICE_PCM_BYTES } from './voice-audio.js';

export async function decodeWeChatVoice(
  bytes: Uint8Array,
  voice: MessagingVoice,
  signal: AbortSignal,
): Promise<Uint8Array> {
  signal.throwIfAborted();
  if (voice.encodeType !== undefined && ![4, 6].includes(voice.encodeType))
    throw new MessagingError('audio-codec-unsupported');
  return decodeSilkVoice(bytes, signal);
}
