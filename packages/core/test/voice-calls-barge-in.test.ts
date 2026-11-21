import {
  clipFor,
  connected,
  fakeMedia,
  harness,
  heard,
  settled,
  types,
  view,
} from './voice-calls-fixtures.js';
import { describe, expect, it } from 'vitest';
import { wavFromPcm16 } from '../src/voice/providers.js';
import { clipDurationMs } from '../src/voice/speech.js';
import { concat, cough, knock, silence, speech } from './voice-audio-fixtures.js';

describe('barge-in while the Bot speaks', () => {
  const never = () => new Promise<void>(() => undefined);

  function draft(h: ReturnType<typeof harness>, body: string, draftId = 'b1:c1') {
    h.calls.draft({
      type: 'update',
      draft: {
        channelId: 'dm-mira',
        draftId,
        attemptId: draftId.split(':')[0]!,
        botSlug: 'mira',
        body,
        voice: true,
      },
    });
  }

  async function speaking(
    h: ReturnType<typeof harness>,
    state: ReturnType<typeof fakeMedia>['state'],
    delay: Promise<void> = never(),
  ) {
    const callId = await connected(h);
    h.feed(state.onPcm!, concat(silence(300), speech(1200), silence(900)));
    await settled();
    state.playDelay = delay;
    draft(h, '第一句话。第二句话。第三句话。');
    await settled();
    expect((await view(h, callId)).phase).toBe('bot-speaking');
    return callId;
  }

  const commit = (h: ReturnType<typeof harness>, messageId: string, body: string) =>
    h.calls.speak({ at: h.at(), slug: 'mira', channelId: 'dm-mira', messageId, body });

  it('stops after half a second of speech, sends the Human to the DM and archives only what played', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await speaking(h, state);
    const before = (await view(h, callId)).lastSeq;

    h.feed(state.onPcm!, concat(silence(600), speech(1200)));
    await settled();
    state.playDelay = undefined;
    h.feed(state.onPcm!, silence(900));
    await settled();
    expect(h.sent).toHaveLength(1);
    h.feed(state.onPcm!, silence(400));
    await settled();

    const events = (await view(h, callId, before)).events;
    expect(types(events)).toEqual([
      'speech-start',
      'barge-suspected',
      'reply-stopped',
      'barge-in',
      'hearing',
      'transcribing',
      'sent',
    ]);
    expect(events.find((event) => event.type === 'barge-in')).toMatchObject({
      by: 'duration',
      replyIds: ['reply-1'],
    });
    const suspected = events.find((event) => event.type === 'barge-suspected')!.at;
    const confirmed = events.find((event) => event.type === 'barge-in')!.at;
    expect(confirmed - suspected).toBeGreaterThanOrEqual(250);
    expect(state.gains).toEqual([0.3, 1]);
    expect(state.stopped).toBe(1);
    expect(h.sent.map((item) => item.body)).toEqual(['帮我查一下明天的天气', '第二句话']);

    draft(h, '第一句话。第二句话。第三句话。第四句话。');
    await settled();
    h.calls.draft({ type: 'settled', channelId: 'dm-mira', draftId: 'b1:c1', attemptId: 'b1' });
    const archived = await heard(commit(h, 'bot-1', '第一句话。第二句话。第三句话。第四句话。'));
    await settled();
    expect(state.audio).toEqual([clipFor('第一句话。')]);
    expect(archived).toEqual({ audio: clipFor('第一句话。'), mime: 'audio/mpeg' });
    expect((await view(h, callId)).events.slice(-2)).toEqual([
      expect.objectContaining({ type: 'committed', reused: 1, synthesized: 0, interrupted: true }),
      expect.objectContaining({ type: 'reply-done', messageId: 'bot-1', sentences: 0 }),
    ]);
  });

  it('trims the sentence the Human cut into to the part that played', async () => {
    const { media, state } = fakeMedia();
    const transcripts = ['帮我查一下明天的天气', '停一下换个话题'];
    const h = harness({
      media,
      providers: {
        has: (id, kind) => id.startsWith(kind),
        async transcribe() {
          return { text: transcripts.shift() ?? '', latencyMs: 5 };
        },
        async synthesize({ text }) {
          return {
            audio: wavFromPcm16(new Int16Array(4_000 * 16), 16_000),
            mime: 'audio/wav',
          };
        },
      },
    });
    const callId = await speaking(h, state);
    const playing = (await view(h, callId)).events.findLast((event) => event.type === 'playing')!;
    h.feed(state.onPcm!, concat(silence(600), speech(1200)));
    await settled();
    const stopped = (await view(h, callId)).events.find((event) => event.type === 'barge-in')!;
    state.playDelay = undefined;
    h.feed(state.onPcm!, silence(900));
    await settled();
    h.calls.draft({ type: 'settled', channelId: 'dm-mira', draftId: 'b1:c1', attemptId: 'b1' });
    const archived = await heard(commit(h, 'bot-1', '第一句话。第二句话。第三句话。'));
    expect(archived?.mime).toBe('audio/wav');
    const kept = clipDurationMs(archived!);
    expect(Math.abs(kept - (stopped.at - playing.at))).toBeLessThanOrEqual(20);
    expect(kept).toBeLessThan(4_000);
  });

  it('keeps a cut-in as one sentence when the next Bot sentence starts under it', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media, transcripts: ['帮我查一下明天的天气', '停一下换个话题讲讲故宫吧'] });
    let finish!: () => void;
    const callId = await speaking(h, state, new Promise<void>((resolve) => (finish = resolve)));
    const before = (await view(h, callId)).lastSeq;
    const voice = (ms: number, seed: number) => speech(ms, { dbfs: -38, seed });
    h.feed(state.onPcm!, concat(silence(600), voice(300, 1)));
    await settled();
    state.playDelay = never();
    finish();
    await settled();
    h.feed(state.onPcm!, concat(voice(300, 2), silence(250), voice(700, 3), silence(1300)));
    await settled();
    const events = (await view(h, callId, before)).events;
    expect(types(events)).toContain('barge-in');
    expect(types(events)).not.toContain('noise-discarded');
    expect(types(events)).not.toContain('barge-dismissed');
    expect(h.sent.map((item) => item.body)).toEqual([
      '帮我查一下明天的天气',
      '停一下换个话题讲讲故宫吧',
    ]);
  });

  it('waits out a longer pause after a cut-in and plays no ack over the rest of it', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media, transcripts: ['帮我查一下明天的天气', '停一下换个话题讲讲故宫吧'] });
    const callId = await speaking(h, state);
    const before = (await view(h, callId)).lastSeq;
    h.feed(state.onPcm!, concat(silence(600), speech(900), silence(800), speech(700)));
    await settled();
    state.playDelay = undefined;
    h.feed(state.onPcm!, silence(1300));
    await settled();
    const events = (await view(h, callId, before)).events;
    expect(types(events)).toContain('barge-in');
    expect(types(events)).not.toContain('ack');
    expect(types(events)).not.toContain('noise-discarded');
    expect(h.sent.map((item) => item.body)).toEqual([
      '帮我查一下明天的天气',
      '停一下换个话题讲讲故宫吧',
    ]);
  });

  it('drops a murmur that started over the reply and ended after it', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media, transcripts: ['帮我查一下明天的天气', '嗯嗯'] });
    let finish!: () => void;
    const callId = await speaking(h, state, new Promise<void>((resolve) => (finish = resolve)));
    const before = (await view(h, callId)).lastSeq;
    h.feed(state.onPcm!, concat(silence(600), speech(300)));
    await settled();
    state.playDelay = undefined;
    h.calls.draft({ type: 'settled', channelId: 'dm-mira', draftId: 'b1:c1', attemptId: 'b1' });
    const speech1 = commit(h, 'bot-1', '第一句话。第二句话。第三句话。');
    finish();
    await heard(speech1);
    h.feed(state.onPcm!, concat(speech(150), silence(900)));
    await settled();
    const events = (await view(h, callId, before)).events;
    expect(events.filter((event) => event.type === 'barge-dismissed')).toEqual([
      expect.objectContaining({ reason: 'filler' }),
    ]);
    expect(h.sent).toHaveLength(1);
    expect(state.gains).toEqual([0.3, 1]);
  });

  it('sends a cut-in that outlasts the reply even when it is short', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media, transcripts: ['帮我查一下明天的天气', '停'] });
    let finish!: () => void;
    const callId = await speaking(h, state, new Promise<void>((resolve) => (finish = resolve)));
    const before = (await view(h, callId)).lastSeq;
    h.feed(state.onPcm!, concat(silence(600), speech(300)));
    await settled();
    expect(types((await view(h, callId, before)).events)).toContain('barge-suspected');
    state.playDelay = undefined;
    h.calls.draft({ type: 'settled', channelId: 'dm-mira', draftId: 'b1:c1', attemptId: 'b1' });
    const speech1 = commit(h, 'bot-1', '第一句话。第二句话。第三句话。');
    finish();
    await heard(speech1);
    expect(types((await view(h, callId, before)).events)).toContain('reply-done');
    h.feed(state.onPcm!, concat(speech(150), silence(900)));
    await settled();
    const events = (await view(h, callId, before)).events;
    expect(types(events)).not.toContain('barge-dismissed');
    expect(h.sent.at(-1)?.body).toBe('停');
    expect(state.gains).toEqual([0.3, 1]);
  });

  it('stops for a short command once its transcript has two real words', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media, transcripts: ['你好', '等等别说了'] });
    const callId = await speaking(h, state);
    const before = (await view(h, callId)).lastSeq;
    h.feed(state.onPcm!, concat(silence(600), speech(420), silence(900)));
    await settled();
    const events = (await view(h, callId, before)).events;
    expect(types(events)).toEqual([
      'speech-start',
      'barge-suspected',
      'transcribing',
      'reply-stopped',
      'barge-in',
      'sent',
    ]);
    expect(events.find((event) => event.type === 'barge-in')).toMatchObject({ by: 'words' });
    expect(state.stopped).toBe(1);
    expect(h.sent.at(-1)?.body).toBe('等等别说了');
  });

  it('retries the volume after the media helper refused to restore it', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await speaking(h, state);
    state.failGain = 1;
    h.feed(state.onPcm!, concat(silence(600), speech(700)));
    await settled();
    expect(types((await view(h, callId)).events)).toContain('barge-in');
    expect(state.gains).toEqual([0.3]);
    await h.ok({ kind: 'mute', callId, muted: true });
    expect(state.gains).toEqual([0.3, 1]);
  });

  it('restores the volume and forgets a suspected cut-in when the Human mutes', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await speaking(h, state);
    const before = (await view(h, callId)).lastSeq;
    h.feed(state.onPcm!, concat(silence(600), speech(300)));
    await settled();
    expect(state.gains).toEqual([0.3]);
    await h.ok({ kind: 'mute', callId, muted: true });
    expect(state.gains).toEqual([0.3, 1]);
    await h.ok({ kind: 'mute', callId, muted: false });
    h.feed(state.onPcm!, concat(silence(600), speech(300)));
    await settled();
    const events = (await view(h, callId, before)).events;
    expect(types(events)).not.toContain('barge-in');
    expect(types(events).filter((type) => type === 'barge-suspected')).toHaveLength(2);
    expect(state.gains).toEqual([0.3, 1, 0.3]);
    expect(state.stopped).toBe(0);
  });

  it('keeps talking through coughs, knocks, short noise and a murmured "嗯嗯", and nothing reaches the DM', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media, transcripts: ['你好', '嗯嗯'] });
    const callId = await speaking(h, state);
    const before = (await view(h, callId)).lastSeq;
    h.feed(
      state.onPcm!,
      concat(
        silence(600),
        cough(350),
        silence(600),
        knock(),
        silence(400),
        cough(300),
        silence(600),
        speech(240),
        silence(900),
        speech(420),
        silence(900),
      ),
    );
    await settled();
    const events = (await view(h, callId, before)).events;
    expect(types(events)).not.toContain('barge-in');
    expect(types(events)).not.toContain('reply-stopped');
    expect(events.filter((event) => event.type === 'barge-dismissed')).toEqual([
      expect.objectContaining({ reason: 'ended' }),
      expect.objectContaining({ reason: 'filler' }),
    ]);
    expect(state.gains).toEqual([0.3, 1, 0.3, 1]);
    expect(state.stopped).toBe(0);
    expect(h.sent).toHaveLength(1);
    expect((await view(h, callId)).phase).toBe('bot-speaking');
  });

  const echo = () =>
    concat(speech(300, { dbfs: -36, f0: 210 }), speech(2500, { dbfs: -52, f0: 210 }));

  it('does not take its own echo for the Human', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await speaking(h, state);
    const before = (await view(h, callId)).lastSeq;
    h.feed(state.onPcm!, echo());
    await settled();
    const events = (await view(h, callId, before)).events;
    expect(types(events)).toEqual([]);
    expect(h.transcribed).toHaveLength(1);
    expect(state.gains).toEqual([]);
  });

  it('needs the echo guard: the same leak without it is heard as the Human', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media, bargeIn: { echoGuardDb: 0 } });
    const callId = await speaking(h, state);
    const before = (await view(h, callId)).lastSeq;
    h.feed(state.onPcm!, echo());
    await settled();
    expect(types((await view(h, callId, before)).events)).toContain('barge-suspected');
  });

  it('keeps only the heard sentences of a reply that had already committed', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    h.feed(state.onPcm!, concat(silence(300), speech(1200), silence(900)));
    await settled();
    state.playDelay = never();
    const speech_ = commit(h, 'bot-2', '第一句。第二句。第三句。');
    await settled();
    h.feed(state.onPcm!, concat(silence(600), speech(1200)));
    await settled();
    state.playDelay = undefined;
    h.feed(state.onPcm!, silence(900));
    const done = await (await speech_)!.archive;
    expect(done).toEqual({
      clip: { audio: clipFor('第一句。'), mime: 'audio/mpeg' },
      interrupted: true,
    });
    expect(
      (await view(h, callId)).events.find((event) => event.type === 'reply-done'),
    ).toMatchObject({ messageId: 'bot-2', sentences: 0 });
  });

  it('reads its thresholds from the call owner options', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media, bargeIn: { confirmMs: 2_000, confirmWords: 9, duckGain: 0.5 } });
    const callId = await speaking(h, state);
    const before = (await view(h, callId)).lastSeq;
    h.feed(state.onPcm!, concat(silence(600), speech(1200), silence(900)));
    await settled();
    const events = (await view(h, callId, before)).events;
    expect(types(events)).not.toContain('barge-in');
    expect(events.find((event) => event.type === 'barge-dismissed')).toMatchObject({
      reason: 'filler',
    });
    expect(state.gains).toEqual([0.5, 1]);
    expect(h.sent).toHaveLength(1);
  });
});
