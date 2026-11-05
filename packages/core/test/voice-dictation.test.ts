import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createVoiceDictations,
  pcmFromBase64,
  VoiceDictationError,
  type VoiceDictationProviders,
} from '../src/voice/dictation.js';
import type { AsrStream } from '../src/voice/soniox.js';
import { chunks, concat, silence, speech } from './voice-audio-fixtures.js';

function streamingProviders() {
  const pushed: number[] = [];
  let cancelled = 0;
  const providers: VoiceDictationProviders = {
    has: (id) => id === 'soniox' || id === 'local',
    listAsr: () => [
      { id: 'local', streaming: false },
      { id: 'soniox', streaming: true },
    ],
    streams: (id) => id === 'soniox',
    openStream: ({ onText }): AsrStream => {
      let words = 0;
      return {
        push(pcm) {
          pushed.push(pcm.length);
          words += 1;
          onText?.(Array.from({ length: words }, (_, index) => `w${index + 1}`).join(' '));
        },
        finish: async () => ({ text: `final ${words}`, latencyMs: 5 }),
        cancel: () => {
          cancelled += 1;
        },
      };
    },
    transcribe: async () => ({ text: 'batch', latencyMs: 1 }),
  };
  return { providers, pushed, cancelled: () => cancelled };
}

function segmentedProviders(fail = false) {
  const lengths: number[] = [];
  const providers: VoiceDictationProviders = {
    has: (id) => id === 'local',
    listAsr: () => [{ id: 'local', streaming: false }],
    streams: () => false,
    openStream: () => undefined,
    transcribe: async ({ audio }) => {
      lengths.push(audio.byteLength);
      if (fail) throw new Error('down');
      return { text: `第${lengths.length}段`, latencyMs: 1 };
    },
  };
  return { providers, lengths };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.useRealTimers();
});

describe('composer dictation', () => {
  it('streams live text from a streaming provider and returns the final transcript', async () => {
    const { providers, pushed } = streamingProviders();
    const dictations = createVoiceDictations({ providers: () => providers, botAsr: () => null });
    expect(dictations.readiness({})).toMatchObject({
      ready: true,
      providerId: 'soniox',
      mode: 'stream',
    });
    const opened = dictations.open({});
    expect(opened).toMatchObject({ providerId: 'soniox', mode: 'stream', state: 'listening' });
    expect(dictations.push(opened.id, new Int16Array(3200)).text).toBe('w1');
    expect(dictations.push(opened.id, new Int16Array(3200)).text).toBe('w1 w2');
    const done = await dictations.stop(opened.id);
    expect(done).toMatchObject({ state: 'done', text: 'final 2', audioMs: 400 });
    expect(pushed).toEqual([3200, 3200]);
    expect(dictations.active()).toBe(0);
  });

  it('uses the Bot binding before the Host default', () => {
    const { providers } = streamingProviders();
    const dictations = createVoiceDictations({
      providers: () => providers,
      botAsr: (slug) => (slug === 'mia' ? { providerId: 'local', language: 'zh' } : null),
    });
    expect(dictations.readiness({ slug: 'mia' })).toMatchObject({
      providerId: 'local',
      mode: 'segments',
    });
    expect(dictations.readiness({ slug: 'other' }).providerId).toBe('soniox');
  });

  it('cuts at pauses and appends each transcribed piece for a batch provider', async () => {
    const { providers, lengths } = segmentedProviders();
    const dictations = createVoiceDictations({ providers: () => providers, botAsr: () => null });
    const opened = dictations.open({});
    expect(opened.mode).toBe('segments');
    const audio = concat(silence(400), speech(900), silence(450), speech(900, { seed: 4 }));
    for (const chunk of chunks(audio, 3200)) dictations.push(opened.id, chunk);
    await flush();
    expect(dictations.push(opened.id, silence(100)).text).toBe('第1段');
    const done = await dictations.stop(opened.id);
    expect(done).toMatchObject({ state: 'done', text: '第1段第2段' });
    expect(lengths).toHaveLength(2);
  });

  it('reports a provider failure and drops the session', async () => {
    const { providers } = segmentedProviders(true);
    const dictations = createVoiceDictations({ providers: () => providers, botAsr: () => null });
    const opened = dictations.open({});
    for (const chunk of chunks(concat(speech(900), silence(800)), 3200))
      dictations.push(opened.id, chunk);
    await flush();
    const done = await dictations.stop(opened.id);
    expect(done).toMatchObject({ state: 'failed', error: { code: 'asr-failed' } });
  });

  it('cancels, refuses unknown ids and bounds concurrent sessions', () => {
    const { providers, cancelled } = streamingProviders();
    const dictations = createVoiceDictations({ providers: () => providers, botAsr: () => null });
    const first = dictations.open({});
    expect(dictations.cancel(first.id)).toMatchObject({ state: 'cancelled' });
    expect(cancelled()).toBe(1);
    expect(dictations.push(first.id, new Int16Array(320)).state).toBe('cancelled');
    expect(() => dictations.push('dict-0000000000000000', new Int16Array(1))).toThrow(
      VoiceDictationError,
    );
    for (let index = 0; index < 4; index += 1) dictations.open({});
    expect(() => dictations.open({})).toThrow(/Too many dictations/u);
  });

  it('flags audio past the length limit and stops refreshing the idle timer', () => {
    vi.useFakeTimers();
    const { providers, pushed } = streamingProviders();
    const dictations = createVoiceDictations({ providers: () => providers, botAsr: () => null });
    const opened = dictations.open({});
    const second = 16_000;
    for (let index = 0; index < 119; index += 1) dictations.push(opened.id, new Int16Array(second));
    expect(dictations.push(opened.id, new Int16Array(second)).truncated).toBeUndefined();
    vi.advanceTimersByTime(10_000);
    expect(dictations.push(opened.id, new Int16Array(320))).toMatchObject({
      truncated: true,
      audioMs: 120_000,
    });
    vi.advanceTimersByTime(5_001);
    expect(dictations.push(opened.id, new Int16Array(320)).state).toBe('cancelled');
    expect(pushed).toHaveLength(120);
  });

  it('ends an idle session', () => {
    vi.useFakeTimers();
    const { providers } = streamingProviders();
    const dictations = createVoiceDictations({ providers: () => providers, botAsr: () => null });
    const opened = dictations.open({});
    vi.advanceTimersByTime(15_001);
    expect(dictations.push(opened.id, new Int16Array(320)).state).toBe('cancelled');
  });

  it('says when no ASR Provider exists', () => {
    const dictations = createVoiceDictations({
      providers: () => ({ ...segmentedProviders().providers, listAsr: () => [] }),
      botAsr: () => null,
    });
    expect(dictations.readiness({})).toMatchObject({ ready: false, providerId: null });
    expect(() => dictations.open({})).toThrow(/Add a speech recognition/u);
  });

  it('decodes base64 PCM and refuses odd payloads', () => {
    const pcm = Int16Array.from([1, -2, 300]);
    const encoded = Buffer.from(pcm.buffer).toString('base64');
    expect(Array.from(pcmFromBase64(encoded))).toEqual([1, -2, 300]);
    expect(() => pcmFromBase64(Buffer.from([1, 2, 3]).toString('base64'))).toThrow(/16-bit PCM/u);
    expect(() => pcmFromBase64('A'.repeat(100_000))).toThrow(/too large/u);
  });
});
