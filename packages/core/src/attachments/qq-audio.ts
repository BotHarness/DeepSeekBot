import { decodeSilkVoice } from './voice-audio.js';

export async function decodeQqVoice(bytes: Uint8Array, signal: AbortSignal): Promise<Uint8Array> {
  const wrapper = new TextDecoder().decode(bytes.subarray(0, 6));
  return decodeSilkVoice(wrapper === '#!AMR\n' ? bytes.subarray(6) : bytes, signal);
}
