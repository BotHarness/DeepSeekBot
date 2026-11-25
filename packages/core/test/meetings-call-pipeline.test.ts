import { afterEach, describe, expect, it, vi } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createMeetings, type MeetingFarEndHandlers } from '../src/meetings/meetings.js';
import { createMeetingStore } from '../src/meetings/store.js';
import { createVoiceCalls } from '../src/voice/calls.js';
import { MEETING_CHANNEL_PREFIX } from '../src/voice/calls-types.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import { chunks, concat, silence, speech } from './voice-audio-fixtures.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

describe('a meeting through the real call pipeline', () => {
  it('turns synthetic meeting audio into transcript lines and one Inbox wake, without TTS or a DM', async () => {
    const owner = trackTestOwner(
      mountOperationalDatabase({
        dshHome: createTempRoot('bh-meeting-pipeline-'),
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      }),
    );
    const store = createMeetingStore({ database: attachOperationalModule(owner, 'meetings') });
    const transcripts = ['shall we ship on friday', 'yes, after the review'];
    const dms: string[] = [];
    let meetings: ReturnType<typeof createMeetings> | undefined;
    const calls = createVoiceCalls({
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
      async send({ channelId, body }) {
        if (channelId.startsWith(MEETING_CHANNEL_PREFIX))
          meetings?.hear(channelId.slice(MEETING_CHANNEL_PREFIX.length), body);
        else dms.push(body);
      },
      busy: () => false,
    });
    cleanup.push(() => calls.dispose());
    let handlers: MeetingFarEndHandlers | undefined;
    const woken: string[] = [];
    meetings = createMeetings({
      store,
      calls: () => calls,
      farEnds: () => [
        {
          platform: 'synthetic',
          matches: (url) => url.protocol === 'synthetic:',
          join: async (input) => {
            handlers = input.handlers;
            return { leave: async () => undefined, speaker: () => 'Lin' };
          },
        },
      ],
      bot: () => ({ displayName: 'Ada', asr: { providerId: 'asr-000000000001' } }),
      hasAsr: () => true,
      admitted: (slug) => woken.push(slug),
    });
    cleanup.push(() => meetings!.dispose());

    const attendance = await meetings.join({
      slug: 'ada',
      url: 'synthetic://standup',
      originChannelId: 'dm-ada',
      dispatcher: { kind: 'owner', id: 'human-1', name: 'Vain' },
    });
    handlers!.onAdmitted();
    const say = concat(silence(300), speech(1400), silence(900));
    for (const part of [...chunks(say), ...chunks(say)]) handlers!.onPcm(part);

    await vi.waitFor(() => expect(store.lines(attendance.id)).toHaveLength(2), { timeout: 5_000 });
    expect(store.lines(attendance.id)).toMatchObject([
      { author: 'meeting', speaker: 'Lin', body: 'shall we ship on friday' },
      { author: 'meeting', speaker: 'Lin', body: 'yes, after the review' },
    ]);
    expect(woken).toEqual(['ada']);
    expect(dms).toEqual([]);

    await meetings.leave('ada');
    expect(store.get(attendance.id)).toMatchObject({ state: 'left', endReason: 'asked-to-leave' });
  });
});
