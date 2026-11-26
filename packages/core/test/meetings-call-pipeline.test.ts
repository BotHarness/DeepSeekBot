import { afterEach, describe, expect, it, vi } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createMeetings } from '../src/meetings/meetings.js';
import { createMeetingStore } from '../src/meetings/store.js';
import { VOICE_CALL_HOST_OWNER } from '../src/voice/call-contract.js';
import { createVoiceCalls } from '../src/voice/calls.js';
import { MEETING_CHANNEL_PREFIX } from '../src/voice/calls-types.js';
import { pcmToBase64 } from '../src/voice/pcm.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import { concat, silence, speech } from './voice-audio-fixtures.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

describe('a meeting through the real call pipeline', () => {
  it('turns the Owner window meeting sound into transcript lines and Inbox wakes, even with the Owner muted, never TTS, a DM or a call record', async () => {
    const owner = trackTestOwner(
      mountOperationalDatabase({
        dshHome: createTempRoot('bh-meeting-pipeline-'),
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      }),
    );
    const store = createMeetingStore({ database: attachOperationalModule(owner, 'meetings') });
    const transcripts = ['shall we ship on friday', 'yes, after the review'];
    const dms: string[] = [];
    const records: string[] = [];
    const woken: string[] = [];
    let calls: ReturnType<typeof createVoiceCalls> | undefined;
    const meetings = createMeetings({
      store,
      admitted: (slug) => woken.push(slug),
      async stopCall(callId) {
        await calls?.handle({ deviceId: VOICE_CALL_HOST_OWNER }, { kind: 'hangup', callId });
      },
    });
    cleanup.push(() => meetings.dispose());
    calls = createVoiceCalls({
      bot: (slug) =>
        slug === 'ada' ? { slug, asr: { providerId: 'asr-000000000001' } } : undefined,
      providers: {
        has: (_id, kind) => kind === 'asr',
        transcribe: async () => ({ text: transcripts.shift() ?? '', latencyMs: 3 }),
        synthesize: async () => {
          throw new Error('a meeting must not synthesize speech');
        },
      },
      media: () => undefined,
      meetings: {
        begin: ({ slug, callId }) =>
          meetings.begin({
            slug,
            callId,
            platform: 'synthetic',
            originChannelId: 'dm-ada',
            dispatcher: { kind: 'owner', id: 'human-1' },
          }).id,
        callEnded: (id, reason) => meetings.callEnded(id, reason),
      },
      async send({ channelId, body }) {
        if (channelId.startsWith(MEETING_CHANNEL_PREFIX))
          meetings.hear(channelId.slice(MEETING_CHANNEL_PREFIX.length), body);
        else dms.push(body);
      },
      record: async ({ record }) => {
        records.push(record.state);
        return undefined;
      },
      busy: () => false,
    });
    cleanup.push(() => calls!.dispose());
    const caller = { deviceId: 'desk-1', client: 'window-1' };

    const refused = await calls.handle(caller, { kind: 'open', slug: 'ada', media: 'synthetic' });
    expect(refused).toMatchObject({ ok: false, code: 'tts-not-configured' });

    const opened = await calls.handle(caller, {
      kind: 'open',
      slug: 'ada',
      media: 'synthetic',
      meeting: true,
    });
    if (!opened.ok) throw new Error(String(opened.error));
    const call = opened.call!;
    expect(call.meetingId).toMatch(/^meet-/u);
    expect(call.channelId).toBe(`${MEETING_CHANNEL_PREFIX}${call.meetingId}`);
    const meetingId = call.meetingId!;
    expect(store.get(meetingId)).toMatchObject({ state: 'in-meeting', callId: call.callId });

    const muted = await calls.handle(caller, { kind: 'mute', callId: call.callId, muted: true });
    expect(muted).toMatchObject({ ok: true, call: { muted: true } });
    const say = concat(silence(300), speech(1400), silence(900));
    for (const part of [say, say])
      for (let offset = 0; offset < part.length; offset += 3_200)
        await calls.handle(caller, {
          kind: 'inject',
          callId: call.callId,
          pcm: pcmToBase64(part.subarray(offset, offset + 3_200)),
        });

    await vi.waitFor(() => expect(store.lines(meetingId)).toHaveLength(2), { timeout: 5_000 });
    expect(store.lines(meetingId).map((line) => line.body)).toEqual([
      'shall we ship on friday',
      'yes, after the review',
    ]);
    expect(woken).toEqual(['ada']);

    const second = await calls.handle(
      { deviceId: 'phone-1' },
      { kind: 'open', slug: 'ada', media: 'synthetic', meeting: true },
    );
    expect(second).toMatchObject({ ok: false, code: 'call-active' });

    await calls.handle(caller, { kind: 'hangup', callId: call.callId });
    expect(store.get(meetingId)).toMatchObject({ state: 'left', endReason: 'owner-stopped' });
    expect(woken).toEqual(['ada']);
    expect(dms).toEqual([]);
    expect(records).toEqual([]);
  });

  it('stops the call when the Bot leaves the meeting', async () => {
    const owner = trackTestOwner(
      mountOperationalDatabase({
        dshHome: createTempRoot('bh-meeting-leave-'),
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      }),
    );
    const store = createMeetingStore({ database: attachOperationalModule(owner, 'meetings') });
    let calls: ReturnType<typeof createVoiceCalls> | undefined;
    const meetings = createMeetings({
      store,
      admitted: () => undefined,
      async stopCall(callId) {
        await calls?.handle({ deviceId: VOICE_CALL_HOST_OWNER }, { kind: 'hangup', callId });
      },
    });
    cleanup.push(() => meetings.dispose());
    calls = createVoiceCalls({
      bot: (slug) => ({ slug, asr: { providerId: 'asr-000000000001' } }),
      providers: {
        has: (_id, kind) => kind === 'asr',
        transcribe: async () => ({ text: '', latencyMs: 1 }),
        synthesize: async () => {
          throw new Error('no TTS');
        },
      },
      media: () => undefined,
      meetings: {
        begin: ({ slug, callId }) =>
          meetings.begin({
            slug,
            callId,
            platform: 'synthetic',
            dispatcher: { kind: 'owner' },
          }).id,
        callEnded: (id, reason) => meetings.callEnded(id, reason),
      },
      send: async () => undefined,
      busy: () => false,
    });
    cleanup.push(() => calls!.dispose());
    const opened = await calls.handle(
      { deviceId: 'desk-1' },
      { kind: 'open', slug: 'ada', media: 'synthetic', meeting: true },
    );
    if (!opened.ok) throw new Error(String(opened.error));

    const left = await meetings.leave('ada');
    expect(left).toMatchObject({ state: 'left', endReason: 'asked-to-leave' });
    const status = await calls.handle({ deviceId: 'desk-1' }, { kind: 'status' });
    expect(status.ok && status.calls?.[0]?.phase).toBe('ended');
    await expect(meetings.leave('ada')).rejects.toMatchObject({ code: 'not-in-meeting' });
  });
});
