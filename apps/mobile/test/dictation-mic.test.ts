import { describe, expect, it } from 'vitest';

import { pcm16kFrom } from '../src/host/dictation-mic';

function buffer(samples: number[], sampleRate: number, channels = 1) {
  return { data: new Int16Array(samples).buffer, sampleRate, channels, timestamp: 0 };
}

describe('pcm16kFrom', () => {
  it('passes 16 kHz mono through', () => {
    expect([...pcm16kFrom(buffer([1, -2, 3], 16_000))]).toEqual([1, -2, 3]);
  });

  it('averages a higher rate down to 16 kHz', () => {
    expect([...pcm16kFrom(buffer([0, 300, 600, 900, 1200, 1500], 48_000))]).toEqual([300, 1200]);
  });

  it('mixes stereo to mono', () => {
    expect([...pcm16kFrom(buffer([100, 300, -100, -300], 16_000, 2))]).toEqual([200, -200]);
  });
});
