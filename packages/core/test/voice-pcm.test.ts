import { describe, expect, it } from 'vitest';

import {
  PCM_SAMPLE_RATE,
  PcmError,
  pcm16kFromFloat,
  pcm16kFromInt16,
  pcmFromBase64,
  pcmToBase64,
} from '../src/voice/pcm.js';

describe('voice PCM base64', () => {
  it('round-trips 16-bit little-endian samples', () => {
    const samples = Int16Array.from([0, 1, -1, 300, -32768, 32767]);
    const encoded = pcmToBase64(samples);
    expect(encoded).toBe(Buffer.from(samples.buffer).toString('base64'));
    expect(Array.from(pcmFromBase64(encoded))).toEqual(Array.from(samples));
    expect(pcmToBase64(Int16Array.from([1, -1]))).toBe(btoa('\u0001\u0000ÿÿ'));
  });

  it('encodes a chunk larger than one string block', () => {
    const samples = Int16Array.from({ length: 40_000 }, (_, index) => (index * 7) % 30_000);
    expect(Array.from(pcmFromBase64(pcmToBase64(samples)))).toEqual(Array.from(samples));
  });

  it('refuses an odd byte count, bad base64 and an oversized chunk with a neutral error', () => {
    const odd = () => pcmFromBase64(Buffer.from([1, 2, 3]).toString('base64'));
    expect(odd).toThrow(PcmError);
    expect(odd).toThrow(expect.objectContaining({ code: 'invalid' }));
    expect(() => pcmFromBase64('*not base64*')).toThrow(
      expect.objectContaining({ code: 'invalid' }),
    );
    expect(() => pcmFromBase64('A'.repeat(100_000), { maxBytes: 64 * 1024 })).toThrow(
      expect.objectContaining({ code: 'too-large' }),
    );
    expect(pcmFromBase64('')).toHaveLength(0);
  });
});

describe('voice PCM resampling to 16 kHz mono', () => {
  it('averages 48 kHz float input down to 16 kHz int16', () => {
    const out = pcm16kFromFloat(new Float32Array(48).fill(0.5), 48_000);
    expect(out).toHaveLength(16);
    expect(out[0]).toBe(16_384);
    expect(Array.from(pcm16kFromFloat(Float32Array.from([-1, 1, 2]), PCM_SAMPLE_RATE))).toEqual([
      -32768, 32767, 32767,
    ]);
  });

  it('passes 16 kHz mono int16 through', () => {
    const raw = Int16Array.from([1, -2, 3]);
    expect(pcm16kFromInt16(raw, 16_000)).toBe(raw);
  });

  it('averages a higher int16 rate down to 16 kHz', () => {
    expect([...pcm16kFromInt16(Int16Array.from([0, 300, 600, 900, 1200, 1500]), 48_000)]).toEqual([
      300, 1200,
    ]);
  });

  it('mixes stereo to mono', () => {
    expect([...pcm16kFromInt16(Int16Array.from([100, 300, -100, -300]), 16_000, 2)]).toEqual([
      200, -200,
    ]);
    expect([...pcm16kFromInt16(Int16Array.from([100, 300, 500, 700]), 32_000, 2)]).toEqual([400]);
  });
});
