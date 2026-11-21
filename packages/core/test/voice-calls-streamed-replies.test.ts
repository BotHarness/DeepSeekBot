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
import { joinAudio } from '../src/voice/speech.js';
import { concat, silence, speech } from './voice-audio-fixtures.js';

describe('streamed voice replies', () => {
  function stream(h: ReturnType<typeof harness>, draftId = 'a1:c1') {
    const attemptId = draftId.split(':')[0]!;
    return {
      update(body: string, extra: { bodyComplete?: true; voice?: false } = {}) {
        h.calls.draft({
          type: 'update',
          draft: {
            channelId: 'dm-mira',
            draftId,
            attemptId,
            botSlug: 'mira',
            body,
            ...(extra.voice === false ? {} : { voice: true }),
            ...(extra.bodyComplete === undefined ? {} : { bodyComplete: true }),
          },
        });
      },
      settled() {
        h.calls.draft({ type: 'settled', channelId: 'dm-mira', draftId, attemptId });
      },
      abandoned() {
        h.calls.draft({
          type: 'abandoned',
          channelId: 'dm-mira',
          draftId,
          attemptId,
          reason: 'interrupted',
        });
      },
    };
  }

  async function heardQuestion(h: ReturnType<typeof harness>, onPcm: (pcm: Int16Array) => void) {
    h.feed(onPcm, concat(silence(300), speech(1200), silence(800)));
    await settled();
  }

  it('says "嗯" right after the Human stops, speaks the first sentence before the commit and archives what played', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    await heardQuestion(h, state.onPcm!);
    const draft = stream(h);
    h.advance(800);
    draft.update('明天');
    h.advance(200);
    draft.update('明天会下雨。带');
    await settled();
    h.advance(300);
    draft.update('明天会下雨。带上伞吧。');
    draft.update('明天会下雨。带上伞吧。', { bodyComplete: true });
    await settled();
    draft.settled();
    h.advance(400);
    const archived = await heard(
      h.calls.speak({
        at: h.at(),
        slug: 'mira',
        channelId: 'dm-mira',
        messageId: 'bot-1',
        body: '明天会下雨。带上伞吧。',
      }),
    );
    await settled();

    const events = (await view(h, callId)).events;
    const at = (type: string, extra: Record<string, unknown> = {}) =>
      events.find(
        (event) =>
          event.type === type &&
          Object.entries(extra).every(
            ([key, value]) => (event as Record<string, unknown>)[key] === value,
          ),
      )!.at;
    expect(types(events)).toEqual([
      'connected',
      'speech-start',
      'transcribing',
      'sent',
      'reply-text',
      'playing',
      'played',
      'playing',
      'played',
      'committed',
      'reply-done',
    ]);
    expect(events.find((event) => event.type === 'reply-text')).toMatchObject({ responseMs: 800 });
    expect(events.find((event) => event.type === 'playing')).toMatchObject({
      sentence: 0,
      responseMs: 1_000,
    });
    expect(at('playing', { sentence: 0 })).toBeLessThan(at('committed'));
    expect(events.find((event) => event.type === 'committed')).toMatchObject({
      messageId: 'bot-1',
      reused: 2,
      synthesized: 0,
    });
    expect(h.synthesized).toEqual(['明天会下雨。', '带上伞吧。']);
    expect(state.audio).toEqual([clipFor('明天会下雨。'), clipFor('带上伞吧。')]);
    expect(archived).toEqual(
      joinAudio(state.audio.map((audio) => ({ audio, mime: 'audio/mpeg' }))),
    );
    expect(Buffer.from(archived!.audio).toString('latin1')).toContain(
      Buffer.from('明天会下雨。带上伞吧。').toString('latin1'),
    );
  });

  it('stops at once and keeps nothing when the draft is abandoned', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    await heardQuestion(h, state.onPcm!);
    state.playDelay = new Promise<void>(() => undefined);
    const draft = stream(h);
    draft.update('第一句话。第二句话。第三');
    await settled();
    expect((await view(h, callId)).phase).toBe('bot-speaking');
    draft.abandoned();
    await settled();
    const current = await view(h, callId);
    expect(state.stopped).toBe(1);
    expect(state.audio).toEqual([clipFor('第一句话。')]);
    expect(current.phase).toBe('listening');
    expect(types(current.events).slice(-3)).toEqual(['reply-text', 'playing', 'reply-stopped']);
    expect(current.events.at(-1)).toMatchObject({ reason: 'abandoned' });

    state.playDelay = undefined;
    const archived = await heard(
      h.calls.speak({
        at: h.at(),
        slug: 'mira',
        channelId: 'dm-mira',
        messageId: 'bot-2',
        body: '换个说法。',
      }),
    );
    await settled();
    expect(archived).toEqual({ audio: clipFor('换个说法。'), mime: 'audio/mpeg' });
    expect((await view(h, callId)).events.at(-1)).toMatchObject({
      type: 'reply-done',
      messageId: 'bot-2',
    });
  });

  it('falls back to speaking after the commit when voice came after the body', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    await heardQuestion(h, state.onPcm!);
    const draft = stream(h);
    draft.update('第一句。第二句。', { voice: false, bodyComplete: true });
    await settled();
    expect(state.audio).toEqual([]);
    draft.settled();
    const archived = await heard(
      h.calls.speak({
        at: h.at(),
        slug: 'mira',
        channelId: 'dm-mira',
        messageId: 'bot-3',
        body: '第一句。第二句。',
      }),
    );
    await settled();
    const events = (await view(h, callId)).events;
    expect(types(events).slice(-6)).toEqual([
      'committed',
      'playing',
      'played',
      'playing',
      'played',
      'reply-done',
    ]);
    expect(events.find((event) => event.type === 'committed')).toMatchObject({
      reused: 0,
      synthesized: 2,
    });
    expect(archived).toEqual(
      joinAudio(
        [clipFor('第一句。'), clipFor('第二句。')].map((audio) => ({ audio, mime: 'audio/mpeg' })),
      ),
    );
  });

  it('reuses the sentences that match the committed text and speaks the rewritten rest', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    await heardQuestion(h, state.onPcm!);
    stream(h).update('好的。我来看看。然后');
    await settled();
    const archived = await heard(
      h.calls.speak({
        at: h.at(),
        slug: 'mira',
        channelId: 'dm-mira',
        messageId: 'bot-4',
        body: '好的。明天晴。',
      }),
    );
    await settled();
    expect(
      (await view(h, callId)).events.find((event) => event.type === 'committed'),
    ).toMatchObject({
      reused: 1,
      synthesized: 1,
    });
    expect(state.audio).toEqual([clipFor('好的。'), clipFor('我来看看。'), clipFor('明天晴。')]);
    expect(archived).toEqual(
      joinAudio(
        [clipFor('好的。'), clipFor('明天晴。')].map((audio) => ({ audio, mime: 'audio/mpeg' })),
      ),
    );
  });

  it('never restarts a draft it stopped, even when the draft keeps streaming', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    await heardQuestion(h, state.onPcm!);
    const draft = stream(h);
    draft.update('好的。我来看看。然后');
    await settled();
    draft.update('好吧。别的说法。然后');
    await settled();
    draft.update('好吧。别的说法。然后再说。还有');
    await settled();
    expect(state.audio).toEqual([clipFor('好的。'), clipFor('我来看看。')]);
    const events = (await view(h, callId)).events;
    expect(events.filter((event) => event.type === 'reply-stopped')).toEqual([
      expect.objectContaining({ reason: 'revised' }),
    ]);
    expect(events.filter((event) => event.type === 'reply-text')).toHaveLength(1);
  });

  it('stops at once when the draft takes back a sentence it already queued', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    await heardQuestion(h, state.onPcm!);
    const draft = stream(h);
    draft.update('好的。马上转账。然后');
    await settled();
    draft.update('好的。');
    await settled();
    const events = (await view(h, callId)).events;
    expect(events.filter((event) => event.type === 'reply-stopped')).toEqual([
      expect.objectContaining({ reason: 'revised' }),
    ]);
  });

  it('does not speak a message written before the call started', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    await connected(h);
    await heardQuestion(h, state.onPcm!);
    const before = state.audio.length;
    expect(
      await h.calls.speak({
        at: new Date(0).toISOString(),
        slug: 'mira',
        channelId: 'dm-mira',
        messageId: 'old',
        body: '旧消息。',
      }),
    ).toBeUndefined();
    await settled();
    expect(state.audio).toHaveLength(before);
  });

  it('keeps synthesizing the archive when the call ends mid-reply', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    await heardQuestion(h, state.onPcm!);
    state.playDelay = new Promise<void>(() => undefined);
    const spoken = h.calls.speak({
      at: h.at(),
      slug: 'mira',
      channelId: 'dm-mira',
      messageId: 'bot-5',
      body: '第一句。第二句。',
    });
    await settled();
    await h.ok({ kind: 'hangup', callId });
    expect(await heard(spoken)).toEqual(
      joinAudio(
        [clipFor('第一句。'), clipFor('第二句。')].map((audio) => ({ audio, mime: 'audio/mpeg' })),
      ),
    );
    expect(state.stopped).toBe(1);
    expect(state.audio).toHaveLength(1);
  });
});
