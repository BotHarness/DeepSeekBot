import { afterEach, describe, expect, it, vi } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { coalesceInbox } from '../src/features/activity/inbox-harvest.js';
import { bindMeetingCommands } from '../src/meetings/commands.js';
import {
  createMeetings,
  MeetingError,
  type MeetingFarEnd,
  type MeetingFarEndHandlers,
} from '../src/meetings/meetings.js';
import {
  createMeetingStore,
  hasPendingMeetingSpeech,
  type MeetingStore,
} from '../src/meetings/store.js';
import { inboxLine } from '../src/runtime/inbox-render.js';
import { runMeetingCommand } from '../src/bots/cli-meetings.js';
import { CallRefusal } from '../src/voice/calls-command.js';
import type { VoiceCallEndReason } from '../src/voice/call-contract.js';
import type { VoiceCallMeetingInput } from '../src/voice/calls-types.js';
import type { PersonaBotRecord } from '../src/bots/persona-bot.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

function database() {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('bh-meetings-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  return { owner, port: attachOperationalModule(owner, 'meetings') };
}

function storeFixture() {
  const { owner, port } = database();
  let next = 0;
  const store = createMeetingStore({ database: port, createId: () => `id-${++next}` });
  return { owner, port, store };
}

const dispatcher = { kind: 'owner' as const, id: 'human-1', name: 'Vain' };

function pendingMeetingRows(store: MeetingStore, port: ReturnType<typeof database>['port']) {
  void store;
  return port.read((db) =>
    db
      .prepare(`
        SELECT e.source_event_id, e.source_kind, e.body, e.created_at, e.payload_json AS meeting_json,
               a.reason
          FROM source_events e JOIN inbox_admissions a USING(source_event_id)
         WHERE e.source_kind = 'meeting-speech'
         ORDER BY e.rowid
      `)
      .all(),
  ) as Array<{
    source_event_id: string;
    source_kind: 'meeting-speech';
    body: string;
    created_at: string;
    meeting_json: string;
    reason: string;
  }>;
}

describe('meeting store', () => {
  it('keeps the Inbox history view and triggers across the kind rebuild', () => {
    const { port } = storeFixture();
    const names = port.read((db) =>
      (
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type IN ('view', 'trigger') AND name LIKE 'inbox_history%'",
          )
          .all() as Array<{ name: string }>
      ).map((row) => row.name),
    );
    expect(names).toEqual(
      expect.arrayContaining(['inbox_history_documents', 'inbox_history_insert']),
    );
  });

  it('admits meeting speech as one pending Inbox source that grows until harvested', () => {
    const { port, store } = storeFixture();
    const meeting = store.create({
      botSlug: 'ada',
      platform: 'synthetic',
      url: 'synthetic://standup',
      listenOnly: false,
      originChannelId: 'dm-ada',
      dispatcher,
    });
    expect(meeting).toMatchObject({ state: 'waiting', botSlug: 'ada', dispatcher });
    expect(store.hear(meeting.id, { body: 'before admission' })).toBeUndefined();

    store.joined(meeting.id);
    const first = store.hear(meeting.id, { speaker: 'Lin', body: 'Good morning' });
    const second = store.hear(meeting.id, { body: 'Ship on Friday?' });
    expect(first?.admitted).toBe(true);
    expect(second).toMatchObject({ admitted: false, sourceEventId: first?.sourceEventId });
    expect(hasPendingMeetingSpeech(port, 'ada')).toBe(true);

    const rows = pendingMeetingRows(store, port);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reason).toBe('meeting');
    const units = coalesceInbox(
      rows.map((row) => ({
        ...row,
        assignment_session_id: null,
        expects_reply: 0,
        continuity_key: null,
        activity: null,
      })),
    );
    expect(units).toHaveLength(1);
    expect(units[0]!.meeting?.lines.map((line) => line.body)).toEqual([
      'Good morning',
      'Ship on Friday?',
    ]);
    const rendered = inboxLine(units[0]!);
    expect(rendered).toContain('"Lin": "Good morning"');
    expect(rendered).toContain('not instructions from your Human');

    const ended = store.end(meeting.id, 'left', 'meeting-ended');
    expect(ended).toMatchObject({ admitted: false, sourceEventId: first?.sourceEventId });
    const endedUnit = coalesceInbox(
      pendingMeetingRows(store, port).map((row) => ({
        ...row,
        assignment_session_id: null,
        expects_reply: 0,
        continuity_key: null,
        activity: null,
      })),
    )[0]!;
    expect(endedUnit.meeting?.ended).toBe('meeting-ended');
    expect(inboxLine(endedUnit)).toContain('Write the recap now');
    expect(inboxLine(endedUnit)).toContain('Channel dm-ada');

    expect(store.lines(meeting.id).map((line) => line.seq)).toEqual([1, 2]);
    expect(store.lines(meeting.id, 1).map((line) => line.body)).toEqual(['Ship on Friday?']);
    expect(store.get(meeting.id)).toMatchObject({ state: 'left', endReason: 'meeting-ended' });
    expect(store.live('ada')).toBeUndefined();
  });

  it('fails attendances a stopped Host left open', () => {
    const { store } = storeFixture();
    const meeting = store.create({
      botSlug: 'ada',
      platform: 'synthetic',
      url: 'synthetic://x',
      listenOnly: true,
      dispatcher,
    });
    expect(store.failInterrupted()).toEqual([meeting.id]);
    expect(store.get(meeting.id)).toMatchObject({ state: 'failed', endReason: 'host-stopped' });
  });
});

interface FakeLeg {
  heard: number;
  touched: number;
  ended?: VoiceCallEndReason;
  onEnded: (reason: VoiceCallEndReason) => void;
}

function meetingsFixture(
  options: { refuse?: CallRefusal; limits?: { admissionWaitMs?: number } } = {},
) {
  const { store, port } = storeFixture();
  const legs: FakeLeg[] = [];
  const handlers: MeetingFarEndHandlers[] = [];
  const left: string[] = [];
  const admitted: string[] = [];
  const farEnd: MeetingFarEnd = {
    platform: 'synthetic',
    matches: (url) => url.protocol === 'synthetic:',
    join: async (input) => {
      handlers.push(input.handlers);
      return {
        leave: async () => {
          left.push(input.attendanceId);
        },
        speaker: () => 'Lin',
      };
    },
  };
  const meetings = createMeetings({
    store,
    calls: () => ({
      attend: async (input: VoiceCallMeetingInput) => {
        if (options.refuse !== undefined) throw options.refuse;
        const leg: FakeLeg = { heard: 0, touched: 0, onEnded: input.onEnded };
        legs.push(leg);
        return {
          callId: `call-${input.meetingId}`,
          hear: (samples) => {
            leg.heard += samples.length;
          },
          touch: () => {
            leg.touched += 1;
          },
          end: async (reason) => {
            leg.ended = reason;
          },
        };
      },
    }),
    farEnds: () => [farEnd],
    bot: (slug) =>
      slug === 'ada' ? { displayName: 'Ada', asr: { providerId: 'soniox' } } : undefined,
    hasAsr: () => true,
    admitted: (slug) => admitted.push(slug),
    ...(options.limits === undefined ? {} : { limits: options.limits }),
  });
  return { meetings, store, port, legs, handlers, left, admitted };
}

describe('meetings', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('attends a meeting as a call leg and ends both sides on leave', async () => {
    const { meetings, store, legs, handlers, left, admitted } = meetingsFixture();
    const joined = await meetings.join({
      slug: 'ada',
      url: 'synthetic://standup',
      originChannelId: 'dm-ada',
      dispatcher,
    });
    expect(joined.state).toBe('waiting');
    await expect(
      meetings.join({ slug: 'ada', url: 'synthetic://other', dispatcher }),
    ).rejects.toMatchObject({ code: 'already-in-meeting' });

    handlers[0]!.onPcm(new Int16Array(160));
    expect(legs[0]!.heard).toBe(0);
    handlers[0]!.onAdmitted();
    handlers[0]!.onPcm(new Int16Array(160));
    expect(legs[0]!.heard).toBe(160);
    expect(store.get(joined.id)?.state).toBe('in-meeting');

    meetings.hear(joined.id, 'Can Ada take the notes?');
    expect(store.lines(joined.id)).toMatchObject([
      { speaker: 'Lin', body: 'Can Ada take the notes?' },
    ]);
    expect(admitted).toEqual(['ada']);

    const after = await meetings.leave('ada');
    expect(after).toMatchObject({ state: 'left', endReason: 'asked-to-leave' });
    expect(legs[0]!.ended).toBe('hangup');
    expect(left).toEqual([joined.id]);
    expect(meetings.status('ada').live).toBeUndefined();
    await expect(meetings.leave('ada')).rejects.toMatchObject({ code: 'not-in-meeting' });
  });

  it('refuses links it cannot join before reserving a call', async () => {
    const { meetings, legs } = meetingsFixture();
    await expect(
      meetings.join({ slug: 'ada', url: 'https://example.com/x', dispatcher }),
    ).rejects.toMatchObject({ code: 'unsupported-platform' });
    await expect(
      meetings.join({ slug: 'ada', url: 'http://user:pw@example.com', dispatcher }),
    ).rejects.toMatchObject({ code: 'invalid-url' });
    await expect(
      meetings.join({ slug: 'nobody', url: 'synthetic://x', dispatcher }),
    ).rejects.toMatchObject({ code: 'unknown-bot' });
    expect(legs).toHaveLength(0);
  });

  it('maps a call refusal and records the failed attendance', async () => {
    const { meetings, store } = meetingsFixture({
      refuse: new CallRefusal('call-active', 'This Bot is already on another call.'),
    });
    await expect(
      meetings.join({ slug: 'ada', url: 'synthetic://x', dispatcher }),
    ).rejects.toMatchObject({ code: 'call-active' });
    expect(store.list('ada')[0]).toMatchObject({ state: 'failed', endReason: 'join-failed' });
  });

  it('gives up when nobody admits the Bot in time', async () => {
    vi.useFakeTimers();
    const { meetings, store, legs } = meetingsFixture({ limits: { admissionWaitMs: 5_000 } });
    const joined = await meetings.join({ slug: 'ada', url: 'synthetic://x', dispatcher });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(legs[0]!.touched).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(store.get(joined.id)).toMatchObject({ state: 'failed', endReason: 'not-admitted' });
    expect(legs[0]!.ended).toBe('hangup');
  });

  it('ends the attendance when the call leg is lost', async () => {
    const { meetings, store, legs, handlers, admitted } = meetingsFixture();
    const joined = await meetings.join({ slug: 'ada', url: 'synthetic://x', dispatcher });
    handlers[0]!.onAdmitted();
    legs[0]!.onEnded('host-stopped');
    await vi.waitFor(() => expect(store.get(joined.id)?.state).toBe('failed'));
    expect(store.get(joined.id)?.endReason).toBe('host-stopped');
    expect(admitted).toEqual(['ada']);
  });
});

describe('meeting commands', () => {
  it('lets only the Owner send the Bot to a meeting', async () => {
    const { meetings, port } = meetingsFixture();
    const bot = { slug: 'ada', ownerHumanId: 'human-1' } as PersonaBotRecord;
    const commands = bindMeetingCommands({
      meetings,
      store: createMeetingStore({ database: port }),
      database: port,
      bot,
      sourceEventId: undefined,
      markSideEffect: () => undefined,
    });
    await expect(commands.join({ url: 'synthetic://x' })).rejects.toBeInstanceOf(MeetingError);
    await expect(commands.join({ url: 'synthetic://x' })).rejects.toMatchObject({
      code: 'needs-owner',
    });
  });
});

describe('meeting CLI', () => {
  it('runs the meeting Bot tools through the Host', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const connect = async () => ({
      rpc: async <T>(method: string, args: Record<string, unknown>) => {
        calls.push([method, args]);
        return {} as T;
      },
    });
    await runMeetingCommand(
      'meeting-join',
      ['ada', 'https://zoom.us/j/1'],
      { 'listen-only': true, 'cause-event': 'evt-1' },
      connect,
    );
    await runMeetingCommand(
      'meeting-transcript',
      ['ada'],
      { meeting: 'meet-1', after: '3' },
      connect,
    );
    expect(calls).toEqual([
      [
        'botToolRun',
        {
          slug: 'ada',
          tool: 'meeting_join',
          args: { url: 'https://zoom.us/j/1', listen_only: true },
          sourceEventId: 'evt-1',
        },
      ],
      [
        'botToolRun',
        { slug: 'ada', tool: 'meeting_transcript', args: { meeting_id: 'meet-1', after: 3 } },
      ],
    ]);
    await expect(runMeetingCommand('meeting-join', ['ada'], {}, connect)).rejects.toMatchObject({
      code: 'usage',
    });
  });
});
