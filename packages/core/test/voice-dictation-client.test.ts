import { describe, expect, it } from 'vitest';

import {
  createComposerDictation,
  createVoiceDictationPort,
  DictationMicError,
  type DictationMic,
  type DictationRecognizer,
  type DictationRecognizerEvents,
  type VoiceDictationPort,
  type VoiceDictationView,
} from '../src/voice/dictation-client.js';

const settle = async () => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
};

function textRecognizer() {
  let events: DictationRecognizerEvents | undefined;
  let cancelled = 0;
  let finish: ((text: string | undefined) => void) | undefined;
  const recognizer: DictationRecognizer = {
    async start(listener) {
      events = listener;
      listener.listening();
    },
    finish: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    cancel: () => {
      cancelled += 1;
    },
  };
  return {
    recognizer,
    say: (text: string) => events?.text(text),
    end: () => events?.end(),
    limit: () => events?.limit(),
    fail: () => events?.fail('failed'),
    finish: (text?: string) => finish?.(text),
    cancelled: () => cancelled,
  };
}

function hostAdapter(text: string, options: { truncated?: boolean } = {}) {
  const calls: string[] = [];
  let emit: ((samples: Int16Array) => void) | undefined;
  const base: VoiceDictationView = {
    id: 'dict-0000000000000001',
    providerId: 'local',
    mode: 'stream',
    state: 'listening',
    text: '',
    audioMs: 0,
  };
  const port: VoiceDictationPort = {
    readiness: async () => ({
      ready: true,
      providerId: 'local',
      mode: 'stream',
      sampleRate: 16_000,
    }),
    open: async () => {
      calls.push('open');
      return base;
    },
    push: async () => {
      calls.push('push');
      return { ...base, text, ...(options.truncated === true ? { truncated: true as const } : {}) };
    },
    stop: async () => {
      calls.push('stop');
      return { ...base, state: 'done', text };
    },
    cancel: async () => {
      calls.push('cancel');
      return { ...base, state: 'cancelled' };
    },
  };
  const mic: DictationMic = {
    start: async (onPcm) => {
      emit = onPcm;
    },
    stop: () => {
      emit = undefined;
    },
  };
  return { port, mic, calls, say: () => emit?.(new Int16Array(16_000)) };
}

function drafts() {
  const values: { value: string; caret: number }[] = [];
  return {
    onText: (value: string, caret: number) => values.push({ value, caret }),
    last: () => values.at(-1),
  };
}

describe('dictation controller owns the draft splice (#3784)', () => {
  it.each([
    ['Latin + Latin', { before: 'Book', after: '' }, 'a table', 'Book a table', 12],
    ['CJK + Latin', { before: '明天', after: '' }, 'Shanghai', '明天Shanghai', 10],
    [
      'caret in the middle',
      { before: 'Book ', after: 'for two' },
      'a table',
      'Book a table for two',
      12,
    ],
  ])('splices through the phone-speech adapter: %s', async (_name, draft, heard, value, caret) => {
    const source = textRecognizer();
    const out = drafts();
    const controller = createComposerDictation({ recognizer: () => source.recognizer, ...out });
    controller.start('toggle', draft);
    await settle();
    source.say(heard);
    expect(out.last()).toEqual({ value, caret });
  });

  it('splices through the Host ASR adapter: Book + a table', async () => {
    const host = hostAdapter('a table');
    const out = drafts();
    const controller = createComposerDictation({ port: host.port, mic: host.mic, ...out });
    controller.start('toggle', { before: 'Book', after: '' });
    await settle();
    expect(controller.snapshot().status).toBe('listening');
    host.say();
    await settle();
    expect(out.last()).toEqual({ value: 'Book a table', caret: 12 });
    expect(await controller.stop()).toBe('a table');
    expect(host.calls).toEqual(['open', 'push', 'stop']);
    expect(controller.snapshot().status).toBe('idle');
  });

  it('restores the draft on cancel through either adapter', async () => {
    const source = textRecognizer();
    const out = drafts();
    const controller = createComposerDictation({ recognizer: () => source.recognizer, ...out });
    controller.start('toggle', { before: 'keep ', after: '!' });
    await settle();
    source.say('nope');
    controller.cancel();
    expect(out.last()).toEqual({ value: 'keep !', caret: 5 });
    expect(source.cancelled()).toBe(1);
    source.say('late');
    expect(out.last()).toEqual({ value: 'keep !', caret: 5 });

    const host = hostAdapter('nope');
    const hosted = drafts();
    const second = createComposerDictation({ port: host.port, mic: host.mic, ...hosted });
    second.start('toggle', { before: 'keep', after: '' });
    await settle();
    host.say();
    await settle();
    second.cancel();
    await settle();
    expect(hosted.last()).toEqual({ value: 'keep', caret: 4 });
    expect(host.calls).toContain('cancel');
  });

  it('ends limited when the source reaches its length limit', async () => {
    const host = hostAdapter('long', { truncated: true });
    const out = drafts();
    const controller = createComposerDictation({ port: host.port, mic: host.mic, ...out });
    controller.start('toggle');
    await settle();
    host.say();
    await settle();
    await settle();
    expect(controller.snapshot()).toMatchObject({ status: 'limited', text: 'long' });
    expect(host.calls).toEqual(['open', 'push', 'stop']);

    const source = textRecognizer();
    const phone = createComposerDictation({ recognizer: () => source.recognizer, ...drafts() });
    phone.start('toggle');
    await settle();
    source.limit();
    expect(phone.snapshot().status).toBe('finishing');
    source.finish('done');
    await settle();
    expect(phone.snapshot()).toMatchObject({ status: 'limited', text: 'done' });
  });

  it('settles idle when the source ends on its own and failed when it fails', async () => {
    const source = textRecognizer();
    const controller = createComposerDictation({
      recognizer: () => source.recognizer,
      ...drafts(),
    });
    controller.start('toggle');
    await settle();
    source.say('hi');
    source.end();
    expect(controller.snapshot()).toMatchObject({ status: 'idle', text: 'hi' });
    controller.start('toggle');
    await settle();
    source.fail();
    expect(controller.snapshot().status).toBe('failed');
  });

  it('maps a blocked or missing microphone', async () => {
    for (const [code, status] of [
      ['microphone-denied', 'denied'],
      ['microphone-missing', 'missing'],
    ] as const) {
      const controller = createComposerDictation({
        recognizer: () => ({
          start: async () => {
            throw new DictationMicError(code);
          },
          finish: async () => undefined,
          cancel: () => undefined,
        }),
        ...drafts(),
      });
      controller.start('toggle');
      await settle();
      expect(controller.snapshot().status).toBe(status);
    }
  });
});

describe('shared voiceDictation port', () => {
  it('sends the same RPC from any Client call function and validates answers', async () => {
    const sent: unknown[] = [];
    const port = createVoiceDictationPort(
      async (method, args) => {
        sent.push([method, args]);
        if (args['kind'] === 'readiness') return { readiness: { ready: true } };
        if (args['kind'] === 'push') return { nope: true };
        return { dictation: { id: 'dict-0000000000000001', text: '' } };
      },
      { slug: 'mika' },
    );
    expect(await port.readiness()).toEqual({ ready: true });
    expect((await port.open()).id).toBe('dict-0000000000000001');
    await expect(port.push('dict-0000000000000001', 'AAA=')).rejects.toThrow(/invalid/u);
    expect(sent.slice(0, 2)).toEqual([
      ['voiceDictation', { kind: 'readiness', slug: 'mika' }],
      ['voiceDictation', { kind: 'open', slug: 'mika' }],
    ]);
  });
});
