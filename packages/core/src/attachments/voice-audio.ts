import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { MessagingError } from '../messaging/provider.js';

export const MAX_VOICE_INPUT_BYTES = 1024 * 1024;
export const MAX_VOICE_PCM_BYTES = 12 * 1024 * 1024;
const OUTPUT_SAMPLE_RATE = 24000;
const DECODE_TIMEOUT_MS = 10000;

function silkFrames(bytes: Uint8Array): number {
  const signature = new TextDecoder().decode(
    bytes.subarray(bytes[0] === 2 ? 1 : 0, bytes[0] === 2 ? 10 : 9),
  );
  if (signature !== '#!SILK_V3') throw new MessagingError('audio-codec-unsupported');
  let offset = bytes[0] === 2 ? 10 : 9;
  let frames = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (offset < bytes.length) {
    if (offset + 2 > bytes.length) throw new MessagingError('audio-decode-failed');
    const size = view.getInt16(offset, true);
    offset += 2;
    if (size === -1 && offset === bytes.length) break;
    if (size <= 0 || size > 32767 || offset + size > bytes.length || ++frames > 6000)
      throw new MessagingError('audio-decode-failed');
    offset += size;
  }
  if (!frames) throw new MessagingError('audio-decode-failed');
  return frames;
}

function pcmWav(pcm: Uint8Array): Uint8Array {
  if (!pcm.length || pcm.length % 2 || pcm.length > MAX_VOICE_PCM_BYTES)
    throw new MessagingError('audio-decode-failed');
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(OUTPUT_SAMPLE_RATE, 24);
  wav.writeUInt32LE(OUTPUT_SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(pcm.length, 40);
  wav.set(pcm, 44);
  return wav;
}

const DECODE_WORKER = `
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  try {
    const { decode } = await import(workerData.moduleUrl);
    const result = await decode(workerData.bytes, 24000);
    if (!result.data?.byteLength || result.data.byteLength > workerData.maxBytes)
      throw new Error('bounded output');
    parentPort.postMessage({ pcm: result.data });
  } catch { parentPort.postMessage({ failed: true }); }
})();`;

export async function decodeSilkVoice(bytes: Uint8Array, signal: AbortSignal): Promise<Uint8Array> {
  signal.throwIfAborted();
  if (!bytes.length || bytes.length > MAX_VOICE_INPUT_BYTES)
    throw new MessagingError('audio-too-large');
  silkFrames(bytes);
  const moduleUrl = pathToFileURL(createRequire(import.meta.url).resolve('silk-wasm')).href;
  return new Promise((resolve, reject) => {
    const worker = new Worker(DECODE_WORKER, {
      eval: true,
      workerData: { moduleUrl, bytes, maxBytes: MAX_VOICE_PCM_BYTES },
      resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 },
    });
    let settled = false;
    const finish = (error?: unknown, pcm?: Uint8Array): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      void worker.terminate();
      if (error) reject(error);
      else {
        try {
          resolve(pcmWav(pcm!));
        } catch (failure) {
          reject(failure);
        }
      }
    };
    const abort = (): void => finish(signal.reason ?? new MessagingError('transfer-cancelled'));
    const timer = setTimeout(
      () => finish(new MessagingError('audio-decode-timeout')),
      DECODE_TIMEOUT_MS,
    );
    signal.addEventListener('abort', abort, { once: true });
    worker.once('message', (result: { failed?: boolean; pcm?: unknown }) => {
      if (signal.aborted) return abort();
      if (!(result.pcm instanceof Uint8Array))
        return finish(new MessagingError('audio-decode-failed'));
      finish(undefined, result.pcm);
    });
    worker.once('error', () => finish(new MessagingError('audio-decode-failed')));
    worker.once('exit', () => finish(new MessagingError('audio-decode-failed')));
    if (signal.aborted) abort();
  });
}
