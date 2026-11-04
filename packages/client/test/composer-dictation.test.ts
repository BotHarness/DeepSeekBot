import { describe, expect, it } from 'vitest';

import {
  createBrowserDictationMic,
  createComposerDictation,
  downsampleTo16k,
  pcmBase64,
  spliceDictation,
  withDictation,
  type DictationMic,
  type VoiceDictationPort,
  type VoiceDictationView,
} from '../src/client/composer-dictation.js';
import { DictationMicError } from '../src/client/composer-dictation.js';

function fakePort(options: { failOpen?: boolean } = {}) {
  const calls: string[] = [];
  let samples = 0;
  const view = (state: VoiceDictationView['state'], text: string): VoiceDictationView => ({
    id: 'dict-0123456789abcdef',
    providerId: 'asr',
    mode: 'stream',
    state,
    text,
    audioMs: (samples / 16_000) * 1000,
  });
  const port: VoiceDictationPort = {
    readiness: async () => ({ ready: true, providerId: 'asr', mode: 'stream', sampleRate: 16_000 }),
    open: async () => {
      calls.push('open');
      if (options.failOpen === true) throw new Error('asr-not-configured');
      return view('listening', '');
    },
    push: async (_id, pcm) => {
      samples += atob(pcm).length / 2;
      calls.push(`push:${atob(pcm).length / 2}`);
      return view('listening', samples >= 6_400 ? '你好' : '你');
    },
    stop: async () => {
      calls.push('stop');
      return view('done', '你好世界');
    },
    cancel: async () => {
      calls.push('cancel');
      return view('cancelled', '');
    },
  };
  return { port, calls };
}

function fakeMic(error?: DictationMicError) {
  let emit: ((samples: Int16Array) => void) | undefined;
  let stopped = 0;
  const mic: DictationMic = {
    start: async (onPcm) => {
      if (error !== undefined) throw error;
      emit = onPcm;
    },
    stop: () => {
      stopped += 1;
      emit = undefined;
    },
  };
  return { mic, say: (samples: number) => emit?.(new Int16Array(samples)), stopped: () => stopped };
}

const settle = async () => {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
};

describe('composer dictation', () => {
  it('streams microphone chunks and fills the live then final text', async () => {
    const { port, calls } = fakePort();
    const { mic, say } = fakeMic();
    const texts: string[] = [];
    const dictation = createComposerDictation({ port, mic, onText: (text) => texts.push(text) });
    dictation.start('hold');
    expect(dictation.snapshot()).toMatchObject({ status: 'starting', mode: 'hold' });
    await settle();
    expect(dictation.snapshot().status).toBe('listening');
    say(1_000);
    say(2_400);
    await settle();
    say(3_200);
    await settle();
    expect(texts).toEqual(['你', '你好']);
    say(500);
    expect(await dictation.stop()).toBe('你好世界');
    expect(dictation.snapshot()).toMatchObject({ status: 'idle', text: '你好世界' });
    expect(calls).toEqual(['open', 'push:3400', 'push:3200', 'push:500', 'stop']);
  });

  it('turns a short press into toggle mode and cancels on request', async () => {
    const { port, calls } = fakePort();
    const { mic, stopped } = fakeMic();
    const dictation = createComposerDictation({ port, mic, onText: () => undefined });
    dictation.start('hold');
    dictation.setMode('toggle');
    await settle();
    expect(dictation.snapshot()).toMatchObject({ status: 'listening', mode: 'toggle' });
    dictation.cancel();
    await settle();
    expect(dictation.snapshot().status).toBe('idle');
    expect(calls).toEqual(['open', 'cancel']);
    expect(stopped()).toBeGreaterThan(0);
  });

  it('reports a blocked microphone and closes the Host session', async () => {
    const { port, calls } = fakePort();
    const { mic } = fakeMic(new DictationMicError('microphone-denied'));
    const dictation = createComposerDictation({ port, mic, onText: () => undefined });
    dictation.start('toggle');
    await settle();
    expect(dictation.snapshot().status).toBe('denied');
    expect(calls).toEqual(['open', 'cancel']);
    dictation.dismiss();
    expect(dictation.snapshot().status).toBe('idle');
  });

  it('closes the Host session when a cancelled start later loses the microphone', async () => {
    const { port, calls } = fakePort();
    let reject: ((error: unknown) => void) | undefined;
    const mic: DictationMic = {
      start: () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
      stop: () => undefined,
    };
    const dictation = createComposerDictation({ port, mic, onText: () => undefined });
    dictation.start('toggle');
    await settle();
    dictation.cancel();
    reject?.(new DictationMicError('microphone-denied'));
    await settle();
    expect(calls).toEqual(['open', 'cancel']);
    expect(dictation.snapshot().status).toBe('idle');
  });

  it('fails when the Host cannot open a session', async () => {
    const { port } = fakePort({ failOpen: true });
    const { mic } = fakeMic();
    const dictation = createComposerDictation({ port, mic, onText: () => undefined });
    dictation.start('toggle');
    await settle();
    expect(dictation.snapshot().status).toBe('failed');
  });

  it('finishes on its own once the Host reports dropped audio past the limit', async () => {
    const { mic, say } = fakeMic();
    let pushes = 0;
    const calls: string[] = [];
    const base: VoiceDictationView = {
      id: 'dict-0000000000000001',
      providerId: 'local',
      mode: 'segments',
      state: 'listening',
      text: '',
      audioMs: 0,
    };
    const port: VoiceDictationPort = {
      readiness: async () => ({
        ready: true,
        providerId: 'local',
        mode: 'segments',
        sampleRate: 16_000,
      }),
      open: async () => base,
      push: async () => {
        pushes += 1;
        return { ...base, text: '全部', ...(pushes > 1 ? { truncated: true as const } : {}) };
      },
      stop: async () => {
        calls.push('stop');
        return { ...base, state: 'done', text: '全部', truncated: true };
      },
      cancel: async () => ({ ...base, state: 'cancelled' }),
    };
    const dictation = createComposerDictation({ port, mic, onText: () => undefined });
    dictation.start('toggle');
    await settle();
    say(3_200);
    await settle();
    say(3_200);
    for (let index = 0; index < 4; index += 1) await settle();
    expect(calls).toEqual(['stop']);
    expect(dictation.snapshot()).toMatchObject({ status: 'limited', text: '全部' });
  });

  it('stops a microphone stream that arrives after the mic was released', async () => {
    let grant: ((stream: MediaStream) => void) | undefined;
    let stoppedTracks = 0;
    const stream = {
      getTracks: () => [{ stop: () => (stoppedTracks += 1) }],
    } as unknown as MediaStream;
    const devices = {
      getUserMedia: () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve;
        }),
    } as unknown as MediaDevices;
    const mic = createBrowserDictationMic(() => devices);
    const started = mic.start(() => undefined);
    await settle();
    mic.stop();
    grant?.(stream);
    await started;
    expect(stoppedTracks).toBe(1);
  });

  it('downsamples to 16 kHz PCM and encodes little-endian base64', () => {
    const input = new Float32Array(48).fill(0.5);
    const out = downsampleTo16k(input, 48_000);
    expect(out.length).toBe(16);
    expect(out[0]).toBe(16_384);
    expect(pcmBase64(Int16Array.from([1, -1]))).toBe(btoa('\u0001\u0000ÿÿ'));
  });

  it('inserts the transcript at the caret and keeps the text after it', () => {
    expect(spliceDictation('草稿：', '明天见', '。后面')).toEqual({
      value: '草稿：明天见。后面',
      caret: 6,
    });
    expect(spliceDictation('call me', 'back', 'tomorrow')).toEqual({
      value: 'call me back tomorrow',
      caret: 12,
    });
    expect(spliceDictation('see you', 'soon', ', ok')).toEqual({
      value: 'see you soon, ok',
      caret: 12,
    });
    expect(spliceDictation('keep', '', ' rest')).toEqual({ value: 'keep rest', caret: 4 });
  });

  it('places the transcript after the existing draft', () => {
    expect(withDictation('', ' hello ')).toBe('hello');
    expect(withDictation('Note:', 'buy milk')).toBe('Note: buy milk');
    expect(withDictation('Note: ', 'buy milk')).toBe('Note: buy milk');
    expect(withDictation('记一下', '买牛奶')).toBe('记一下买牛奶');
    expect(withDictation('draft', '')).toBe('draft');
  });
});
