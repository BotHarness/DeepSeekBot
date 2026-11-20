import { MessagingError } from '../messaging/provider.js';
import { decodeInWorker, MAX_VOICE_INPUT_BYTES } from './voice-audio.js';

const MAX_PACKETS = 20000;

interface OggOpus {
  channels: number;
  preSkip: number;
  packets: Uint8Array[];
}

export function oggOpusPackets(bytes: Uint8Array): OggOpus {
  const ascii = (offset: number, length: number) =>
    new TextDecoder().decode(bytes.subarray(offset, offset + length));
  if (bytes.length < 28 || ascii(0, 4) !== 'OggS')
    throw new MessagingError('audio-codec-unsupported');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const packets: Uint8Array[] = [];
  let pending: Uint8Array[] = [];
  let serial: number | undefined;
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 27 > bytes.length || ascii(offset, 4) !== 'OggS' || bytes[offset + 4] !== 0)
      throw new MessagingError('audio-decode-failed');
    const pageSerial = view.getUint32(offset + 14, true);
    if (serial !== undefined && pageSerial !== serial)
      throw new MessagingError('audio-codec-unsupported');
    serial = pageSerial;
    const segments = bytes[offset + 26]!;
    let data = offset + 27 + segments;
    if (data > bytes.length) throw new MessagingError('audio-decode-failed');
    for (let index = 0; index < segments; index++) {
      const size = bytes[offset + 27 + index]!;
      if (data + size > bytes.length) throw new MessagingError('audio-decode-failed');
      pending.push(bytes.subarray(data, data + size));
      data += size;
      if (size < 255) {
        const packet = new Uint8Array(pending.reduce((total, part) => total + part.length, 0));
        let at = 0;
        for (const part of pending) {
          packet.set(part, at);
          at += part.length;
        }
        pending = [];
        if (packet.length) packets.push(packet);
        if (packets.length > MAX_PACKETS + 2) throw new MessagingError('audio-too-large');
      }
    }
    offset = data;
  }
  const head = packets[0];
  if (
    !head ||
    head.length < 19 ||
    new TextDecoder().decode(head.subarray(0, 8)) !== 'OpusHead' ||
    head[18] !== 0 ||
    (head[9] !== 1 && head[9] !== 2)
  )
    throw new MessagingError('audio-codec-unsupported');
  const tags = packets[1];
  if (!tags || new TextDecoder().decode(tags.subarray(0, 8)) !== 'OpusTags' || packets.length < 3)
    throw new MessagingError('audio-decode-failed');
  return {
    channels: head[9]!,
    preSkip: head[10]! | (head[11]! << 8),
    packets: packets.slice(2),
  };
}

const DECODE_WORKER = `
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  try {
    const { OpusDecoder } = await import(workerData.moduleUrl);
    const decoder = new OpusDecoder({
      channels: workerData.channels, preSkip: workerData.preSkip, sampleRate: 24000,
    });
    await decoder.ready;
    const result = decoder.decodeFrames(workerData.packets);
    decoder.free();
    const frames = result.samplesDecoded;
    if (result.errors.length || !frames || frames * 2 > workerData.maxBytes)
      throw new Error('bounded output');
    const pcm = new Uint8Array(frames * 2);
    const view = new DataView(pcm.buffer);
    for (let frame = 0; frame < frames; frame++) {
      let sample = 0;
      for (const channel of result.channelData) sample += channel[frame];
      sample = Math.max(-1, Math.min(1, sample / result.channelData.length));
      view.setInt16(frame * 2, Math.round(sample * 32767), true);
    }
    parentPort.postMessage({ pcm });
  } catch { parentPort.postMessage({ failed: true }); }
})();`;

export async function decodeLarkVoice(bytes: Uint8Array, signal: AbortSignal): Promise<Uint8Array> {
  signal.throwIfAborted();
  if (!bytes.length || bytes.length > MAX_VOICE_INPUT_BYTES)
    throw new MessagingError('audio-too-large');
  const { channels, preSkip, packets } = oggOpusPackets(bytes);
  return decodeInWorker(
    DECODE_WORKER,
    { module: 'opus-decoder', channels, preSkip, packets },
    signal,
  );
}
