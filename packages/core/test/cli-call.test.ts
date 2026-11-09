import { mkdirSync, writeFileSync } from 'node:fs';

import sharp from 'sharp';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CALL_OPTIONS, runCallCommand, type CallValues } from '../src/bots/cli-call.js';
import { createVoiceCalls } from '../src/voice/calls.js';
import { wavFromPcm16 } from '../src/voice/providers.js';
import { readWavAs16kMono } from '../src/voice/wav.js';
import { createTempRoot } from './helpers.js';
import { concat, cough, silence, speech } from './voice-audio-fixtures.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

function host(
  options: { reply?: boolean; clip?: Uint8Array; mime?: string; records?: boolean } = {},
) {
  let clock = 5_000_000;
  const posts: Record<string, unknown>[] = [];
  let records = 0;
  const transcripts = ['what is on my calendar', 'and tomorrow'];
  const calls = createVoiceCalls({
    bot: (slug) =>
      slug === 'ada'
        ? {
            slug,
            asr: { providerId: 'asr-000000000001' },
            voice: { providerId: 'tts-000000000001' },
          }
        : undefined,
    providers: {
      has: () => true,
      transcribe: async () => ({ text: transcripts.shift() ?? '', latencyMs: 3 }),
      synthesize: async ({ text }) =>
        options.clip !== undefined && !/^(嗯|Mm)/u.test(text)
          ? { audio: options.clip, mime: options.mime ?? 'audio/wav' }
          : { audio: new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]), mime: 'audio/mpeg' },
    },
    media: () => undefined,
    async send({ slug, channelId, messageId }) {
      if (options.reply === false) return;
      setTimeout(() => {
        void calls.speak({
          at: new Date(clock).toISOString(),
          slug,
          channelId,
          messageId: `reply-to-${messageId}`,
          body: 'Nothing is on your calendar.',
        });
      }, 0);
      clock += 1_500;
    },
    busy: () => false,
    now: () => clock,
    ...(options.records === true
      ? { recordFrames: async () => `voice-call-frames-${(records += 1)}` }
      : {}),
  });
  cleanup.push(() => calls.dispose());
  const texts: { channelId: string; messageId: string; body: string; callId?: string }[] = [];
  const connect = async () => ({
    post: async (body: Record<string, unknown>) => {
      posts.push(body);
      return calls.handle({ deviceId: 'host-owner' }, body);
    },
    text: async (input: { channelId: string; messageId: string; body: string }) => {
      const harvested = await calls.text({ ...input, picture: true });
      texts.push({
        ...input,
        ...(harvested === undefined ? {} : { callId: harvested.callId }),
      });
      harvested?.settle(true);
      return { message: { id: input.messageId } };
    },
  });
  const fakeClock = {
    now: () => clock,
    async sleep(ms: number) {
      clock += ms;
      for (let turn = 0; turn < 3; turn += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
  };
  const run = (
    command: Parameters<typeof runCallCommand>[0],
    rest: string[],
    values: CallValues = {},
  ) => runCallCommand(command, rest, values, connect, fakeClock);
  return { run, posts, texts };
}

function wav(root: string, name: string, samples: Int16Array, rate = 16_000) {
  const file = join(root, name);
  writeFileSync(file, wavFromPcm16(samples, rate));
  return file;
}

describe('deepseekbot call commands', () => {
  it('call-simulate --video shares the keyframes a client would pick and reports the grids', async () => {
    const root = createTempRoot('cli-call-');
    const file = wav(root, 'q.wav', concat(silence(300), speech(2600), silence(200)));
    const frames = join(root, 'frames');
    mkdirSync(frames);
    const colors = [
      [200, 0, 0],
      [200, 0, 0],
      [0, 0, 200],
      [0, 0, 200],
      [0, 200, 0],
      [0, 200, 0],
    ] as const;
    for (const [index, [r, g, b]] of colors.entries())
      await sharp({ create: { width: 320, height: 180, channels: 3, background: { r, g, b } } })
        .jpeg()
        .toFile(join(frames, `${index + 1}.jpg`));
    const { run, posts } = host();
    const report = (await run('call-simulate', ['ada'], {
      file,
      video: frames,
      'reply-wait': '20',
    })) as { visual: Record<string, unknown> };
    expect(posts[1]).toMatchObject({ kind: 'visual', source: 'camera' });
    expect(posts.filter((post) => post['kind'] === 'frame')).toHaveLength(3);
    expect(report.visual).toMatchObject({
      source: 'camera',
      samples: 6,
      keyframes: 3,
      sentFrames: 3,
      harvest: { commits: 0, commitFrames: 0, sentenceFrames: [3], unchanged: 0, dropped: 0 },
      grids: [
        {
          frames: 3,
          commits: 0,
          layout: '3',
          fromMs: expect.any(Number),
          toMs: expect.any(Number),
          messageId: expect.any(String),
        },
      ],
      failed: [],
    });
    const gridMessage = (report.visual['grids'] as { messageId: string }[])[0]!.messageId;
    expect(await run('call-frame', [gridMessage, '2'])).toEqual({
      released: true,
      messageId: gridMessage,
      cell: 2,
    });
    for (const [rest, values] of [
      [[gridMessage], {}],
      [[gridMessage, '-1'], {}],
      [[gridMessage, '0'], {}],
      [[gridMessage, '17'], {}],
      [[gridMessage, '1'], { out: 'relative.jpg' }],
    ] as const)
      await expect(run('call-frame', [...rest], values)).rejects.toMatchObject({ code: 'usage' });
    await expect(
      run('call-simulate', ['ada'], { file, video: frames, screen: frames }),
    ).rejects.toMatchObject({ code: 'usage' });
    expect(Object.keys(CALL_OPTIONS)).not.toContain('no-save');
    expect(report.visual).not.toHaveProperty('saved');
    expect(posts.filter((post) => post['kind'] === 'visual')).not.toContainEqual(
      expect.objectContaining({ save: expect.anything() }),
    );
    const ended = (await run('call-simulate', ['ada'], {
      file,
      screen: frames,
      'share-ends-at': '1200',
      'reply-wait': '20',
    })) as { visual: Record<string, unknown> };
    expect(
      posts.find((post) => post['kind'] === 'visual' && post['stopped'] === true),
    ).toMatchObject({ source: 'off' });
    expect(ended.visual['shareEndedAtMs']).toBeGreaterThanOrEqual(1200);
    expect(ended.visual['sentFrames']).toBeLessThan(3);
    const paused = (await run('call-simulate', ['ada'], {
      file,
      video: frames,
      'share-pause': '600-1800',
      'reply-wait': '20',
    })) as { visual: Record<string, unknown> };
    expect(
      posts.find((post) => post['kind'] === 'visual' && post['paused'] === true),
    ).toMatchObject({ source: 'off' });
    expect(
      posts.find((post) => post['kind'] === 'visual' && post['resumed'] === true),
    ).toMatchObject({ source: 'camera' });
    expect(paused.visual['pausedAtMs']).toBeGreaterThanOrEqual(600);
    expect(paused.visual['resumedAtMs']).toBeGreaterThanOrEqual(1800);
    for (const values of [
      { file, 'share-pause': '1-2' },
      { file, video: frames, 'share-pause': '900-100' },
      { file, 'share-ends-at': '100' },
      { file, screen: frames, 'share-ends-at': 'soon' },
    ])
      await expect(run('call-simulate', ['ada'], values)).rejects.toMatchObject({ code: 'usage' });
    await expect(run('call-simulate', ['ada'], { file, screen: 'relative' })).rejects.toMatchObject(
      { code: 'usage' },
    );
  });

  it('call-simulate --video reports commits, sentence frames and safety-net drops', async () => {
    const root = createTempRoot('cli-call-');
    const file = wav(root, 'q.wav', concat(silence(300), speech(1400), silence(200)));
    const frames = join(root, 'frames');
    mkdirSync(frames);
    for (let index = 0; index < 40; index += 1)
      await sharp({
        create: {
          width: 320,
          height: 180,
          channels: 3,
          background: index % 4 < 2 ? { r: 230, g: 20, b: 20 } : { r: 20, g: 20, b: 230 },
        },
      })
        .jpeg()
        .toFile(join(frames, `${String(index + 1).padStart(2, '0')}.jpg`));
    const script = join(root, 'script.json');
    writeFileSync(script, JSON.stringify([{ at: 21_000, file }]));
    const { run } = host({ records: true });
    const report = (await run('call-simulate', ['ada'], {
      script,
      video: frames,
      'reply-wait': '20',
    })) as { visual: { keyframes: number; harvest: Record<string, unknown> } };
    const shown = report.visual.keyframes;
    expect(shown).toBeGreaterThan(9);
    const harvest = report.visual.harvest as {
      commits: number;
      commitFrames: number;
      sentenceFrames: number[];
      dropped: number;
    };
    expect(harvest.commits).toBe(Math.floor(shown / 9));
    expect(harvest.commitFrames + harvest.sentenceFrames.reduce((a, b) => a + b, 0)).toBe(shown);
    expect(harvest.dropped).toBe(0);
  });

  it('call-simulate types a text during the call that carries the waiting keyframes', async () => {
    const root = createTempRoot('cli-call-');
    const file = wav(root, 'q.wav', concat(silence(300), speech(1400), silence(200)));
    const frames = join(root, 'frames');
    mkdirSync(frames);
    for (const [index, background] of [
      { r: 200, g: 0, b: 0 },
      { r: 200, g: 0, b: 0 },
      { r: 0, g: 0, b: 200 },
      { r: 0, g: 0, b: 200 },
      { r: 0, g: 200, b: 0 },
      { r: 0, g: 200, b: 0 },
    ].entries())
      await sharp({ create: { width: 320, height: 180, channels: 3, background } })
        .jpeg()
        .toFile(join(frames, `${index + 1}.jpg`));
    const script = join(root, 'script.json');
    writeFileSync(
      script,
      JSON.stringify([
        { at: 6_000, text: 'what is on my camera?' },
        { at: 7_000, file },
      ]),
    );
    const { run, texts } = host();
    const report = (await run('call-simulate', ['ada'], {
      script,
      video: frames,
      'reply-wait': '20',
    })) as {
      callId: string;
      texts: Record<string, unknown>[];
      visual: {
        harvest: Record<string, unknown>;
        unchanged: { messageId: string; sameAs: string }[];
      };
    };
    expect(texts).toEqual([
      expect.objectContaining({ body: 'what is on my camera?', callId: report.callId }),
    ]);
    expect(report.texts).toEqual([
      expect.objectContaining({
        messageId: texts[0]!.messageId,
        sent: true,
        inCall: true,
        callAtMs: expect.any(Number),
        frames: 3,
        commitsBefore: 0,
        layout: '3',
        fromMs: expect.any(Number),
        toMs: expect.any(Number),
      }),
    ]);
    expect(report.visual.harvest).toMatchObject({
      textFrames: [3],
      sentenceFrames: [],
      unchanged: 1,
    });
    expect(report.visual.unchanged[0]!.sameAs).toBe(texts[0]!.messageId);
    for (const step of [
      { at: 0, text: '' },
      { at: 0, text: 'x', file },
      { at: 0, text: 'x'.repeat(2_001) },
    ]) {
      writeFileSync(script, JSON.stringify([step]));
      await expect(run('call-simulate', ['ada'], { script })).rejects.toMatchObject({
        code: 'usage',
      });
    }
  });

  it('call-simulate plays a WAV into a synthetic call and reports heard text and reply timing', async () => {
    const root = createTempRoot('cli-call-');
    const file = wav(root, 'q.wav', concat(silence(300), speech(1400), silence(200)));
    const { run, posts } = host();
    const report = (await run('call-simulate', ['ada'], { file, 'reply-wait': '20' })) as Record<
      string,
      unknown
    >;
    expect(report).toMatchObject({
      slug: 'ada',
      answered: true,
      heard: [{ text: 'what is on my calendar' }],
      replies: [{ bytes: 6, sentences: 1, messageId: expect.stringMatching(/^reply-to-/u) }],
      ackMs: expect.any(Number),
      firstAudioMs: expect.any(Number),
    });
    expect(posts[0]).toEqual({ kind: 'open', slug: 'ada', media: 'synthetic' });
    expect(posts.at(-1)).toMatchObject({ kind: 'hangup' });
    const types = (report['events'] as { type: string }[]).map((event) => event.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'connected',
        'speech-start',
        'ack',
        'sent',
        'committed',
        'playing',
        'played',
        'reply-done',
        'ended',
      ]),
    );
  });

  it('runs a scripted timeline with a cough that is never sent', async () => {
    const root = createTempRoot('cli-call-');
    const first = wav(root, 'one.wav', speech(1200));
    const coughing = wav(root, 'cough.wav', cough(350));
    const second = wav(root, 'two.wav', speech(1000, { f0: 200 }), 48_000);
    const scriptFile = join(root, 'script.json');
    writeFileSync(
      scriptFile,
      JSON.stringify([
        { at: 0, file: first },
        { at: 5_000, file: coughing },
        { at: 7_000, file: second },
      ]),
    );
    const { run, posts } = host();
    const report = (await run('call-simulate', ['ada'], {
      script: scriptFile,
      'reply-wait': '20',
    })) as { heard: { text: string }[]; events: { type: string }[] };
    expect(posts.filter((body) => body['kind'] === 'heartbeat').length).toBeLessThan(10);
    expect(report.heard.map((item) => item.text)).toEqual([
      'what is on my calendar',
      'and tomorrow',
    ]);
    expect(report.events.map((event) => event.type)).toContain('noise-discarded');
  });

  it('barges in once the Bot starts speaking and reports the stop', async () => {
    const root = createTempRoot('cli-call-');
    const first = wav(root, 'one.wav', concat(speech(1200), silence(200)));
    const cut = wav(root, 'cut.wav', speech(1200, { f0: 190 }));
    const scriptFile = join(root, 'script.json');
    writeFileSync(
      scriptFile,
      JSON.stringify([
        { at: 0, file: first },
        { after: 'playing', at: 600, file: cut },
      ]),
    );
    const { run } = host({
      clip: wavFromPcm16(new Int16Array(16_000 * 3), 16_000),
      mime: 'audio/wav',
    });
    const report = (await run('call-simulate', ['ada'], {
      script: scriptFile,
      'reply-wait': '20',
    })) as { heard: { text: string }[]; bargeIns: { by: string }[]; events: { type: string }[] };
    expect(report.bargeIns).toEqual([expect.objectContaining({ by: 'duration' })]);
    expect(report.heard.map((item) => item.text)).toEqual([
      'what is on my calendar',
      'and tomorrow',
    ]);
    expect(report.events.map((event) => event.type)).toContain('reply-stopped');
  });

  it('barges in when the reply starts while the step before is still streaming its tail', async () => {
    const root = createTempRoot('cli-call-');
    const first = wav(root, 'one.wav', concat(speech(1200), silence(4000)));
    const cut = wav(root, 'cut.wav', speech(1200, { f0: 190 }));
    const scriptFile = join(root, 'script.json');
    writeFileSync(
      scriptFile,
      JSON.stringify([
        { at: 0, file: first },
        { after: 'playing', at: 0, file: cut },
      ]),
    );
    const { run } = host({
      clip: wavFromPcm16(new Int16Array(16_000 * 8), 16_000),
      mime: 'audio/wav',
    });
    const report = (await run('call-simulate', ['ada'], {
      script: scriptFile,
      'reply-wait': '20',
    })) as { missedSteps?: number[]; bargeIns: { by: string }[] };
    expect(report.missedSteps).toBeUndefined();
    expect(report.bargeIns).toEqual([expect.objectContaining({ by: 'duration' })]);
  });

  it('stops waiting when nobody answers and still hangs up', async () => {
    const root = createTempRoot('cli-call-');
    const file = wav(root, 'q.wav', speech(1000));
    const { run, posts } = host({ reply: false });
    const report = (await run('call-simulate', ['ada'], { file, 'reply-wait': '3' })) as Record<
      string,
      unknown
    >;
    expect(report).toMatchObject({ answered: false, replies: [], firstAudioMs: null });
    expect(posts.at(-1)).toMatchObject({ kind: 'hangup' });
  });

  it('refuses a timeline and reply wait that would outlast the Host connection, before opening', async () => {
    const root = createTempRoot('cli-call-');
    const file = wav(root, 'q.wav', speech(500));
    const scriptFile = join(root, 'late.json');
    writeFileSync(scriptFile, JSON.stringify([{ at: 500_000, file }]));
    const { run, posts } = host();
    await expect(
      run('call-simulate', ['ada'], { script: scriptFile, 'reply-wait': '90' }),
    ).rejects.toMatchObject({ code: 'usage' });
    expect(posts).toEqual([]);
  });

  it('refuses script steps that overlap, before opening', async () => {
    const root = createTempRoot('cli-call-');
    const file = wav(root, 'q.wav', speech(2000));
    const scriptFile = join(root, 'overlap.json');
    writeFileSync(
      scriptFile,
      JSON.stringify([
        { at: 0, file },
        { at: 1000, file },
      ]),
    );
    const { run, posts } = host();
    await expect(run('call-simulate', ['ada'], { script: scriptFile })).rejects.toMatchObject({
      code: 'usage',
    });
    expect(posts).toEqual([]);
  });

  it('reads readiness and status, and refuses bad arguments before connecting', async () => {
    const { run, posts } = host();
    expect(await run('call-readiness', ['ada'])).toMatchObject({
      ok: true,
      readiness: { ready: false, missing: ['media-unavailable'] },
    });
    expect(await run('call-status', [])).toEqual({ ok: true, calls: [] });
    await expect(run('call-hangup', ['call-0000000000000000'])).rejects.toMatchObject({
      code: 'call-not-found',
    });
    const count = posts.length;
    for (const [command, rest, values] of [
      ['call-simulate', ['ada'], {}],
      ['call-simulate', ['ada'], { file: 'relative.wav' }],
      ['call-simulate', ['ada'], { file: '/a.wav', script: '/b.json' }],
      ['call-readiness', [], {}],
      ['call-status', ['x'], {}],
    ] as const)
      await expect(run(command, [...rest], values as CallValues)).rejects.toMatchObject({
        code: 'usage',
      });
    expect(posts.length).toBe(count);
  });

  it('reads stereo 44.1 kHz WAV as 16 kHz mono', () => {
    const stereo = new Int16Array(44_100 * 2);
    for (let index = 0; index < 44_100; index += 1) {
      stereo[index * 2] = 1000;
      stereo[index * 2 + 1] = 3000;
    }
    const file = wavFromPcm16(stereo, 44_100);
    const view = new DataView(file.buffer);
    view.setUint16(22, 2, true);
    view.setUint32(28, 44_100 * 4, true);
    view.setUint16(32, 4, true);
    const mono = readWavAs16kMono(file);
    expect(mono.length).toBe(16_000);
    expect(mono[100]).toBe(2000);
    expect(() => readWavAs16kMono(new Uint8Array(10))).toThrow(/not a WAV/u);
  });
});
