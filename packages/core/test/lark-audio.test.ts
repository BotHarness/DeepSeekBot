import { expect, it } from 'vitest';
import { decodeLarkVoice, oggOpusPackets } from '../src/attachments/lark-audio.js';
import { MAX_VOICE_INPUT_BYTES } from '../src/attachments/voice-audio.js';
import { oggOpus as original } from './ogg-opus.js';

const signal = () => new AbortController().signal;

it('decodes Ogg Opus voice to bounded mono 24 kHz PCM WAV', async () => {
  const wav = Buffer.from(await decodeLarkVoice(original(), signal()));
  expect(wav.subarray(0, 4).toString()).toBe('RIFF');
  expect(wav.subarray(8, 12).toString()).toBe('WAVE');
  expect(wav.readUInt16LE(22)).toBe(1);
  expect(wav.readUInt32LE(24)).toBe(24000);
  expect(wav.readUInt16LE(34)).toBe(16);
  expect(wav.readUInt32LE(40)).toBe(wav.length - 44);
  const seconds = (wav.length - 44) / 48000;
  expect(seconds).toBeGreaterThan(0.9);
  expect(seconds).toBeLessThan(1.05);
});

it('splits packets across lacing values and keeps the header facts', () => {
  const parsed = oggOpusPackets(original(3));
  expect(parsed).toMatchObject({ channels: 1, preSkip: 312 });
  expect(parsed.packets).toHaveLength(3);
});

it('refuses other containers, multiplexed streams, truncated pages and oversized input', async () => {
  await expect(decodeLarkVoice(Buffer.from('#!SILK_V3 not ogg'), signal())).rejects.toMatchObject({
    code: 'audio-codec-unsupported',
  });
  const mixed = Buffer.concat([original(1), original(1, 8).subarray(0, 60)]);
  await expect(decodeLarkVoice(mixed, signal())).rejects.toMatchObject({
    code: 'audio-codec-unsupported',
  });
  const bytes = original();
  await expect(
    decodeLarkVoice(bytes.subarray(0, bytes.length - 10), signal()),
  ).rejects.toMatchObject({ code: 'audio-decode-failed' });
  await expect(
    decodeLarkVoice(Buffer.alloc(MAX_VOICE_INPUT_BYTES + 1), signal()),
  ).rejects.toMatchObject({ code: 'audio-too-large' });
  const aborted = new AbortController();
  aborted.abort(new Error('stopped'));
  await expect(decodeLarkVoice(original(), aborted.signal)).rejects.toThrow('stopped');
});
