import { afterEach, describe, expect, it, vi } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { coalesceInbox, createInboxHarvest } from '../src/features/activity/inbox-harvest.js';
import { bindMeetingCommands } from '../src/meetings/commands.js';
import { createMeetings } from '../src/meetings/meetings.js';
import {
  createMeetingStore,
  hasPendingMeetingSpeech,
  type MeetingStore,
} from '../src/meetings/store.js';
import { inboxLine } from '../src/runtime/inbox-render.js';
import { runMeetingCommand } from '../src/bots/cli-meetings.js';
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
  it('keeps Inbox history search on the right events after the kind rebuild renumbers rows', () => {
    const dshHome = createTempRoot('bh-meetings-upgrade-');
    const plan = BOT_HARNESS_SCHEMA_PLAN.migrations;
    const before = trackTestOwner(
      mountOperationalDatabase({
        dshHome,
        schemaPlan: defineSchemaPlan(
          plan.slice(
            0,
            plan.findIndex((migration) => migration.id === 'meeting-attendance'),
          ),
        ),
      }),
    );
    attachOperationalModule(before, 'meetings-upgrade').transaction((db) => {
      const insert = db.prepare(
        "INSERT INTO source_events (source_event_id, source_kind, bot_slug, body, created_at) VALUES (?, 'schedule', 'ada', ?, '2026-01-01T00:00:00.000Z')",
      );
      insert.run('gone', 'removed alpha');
      insert.run('kept', 'quarterly roadmap');
      db.prepare("DELETE FROM source_events WHERE source_event_id = 'gone'").run();
    });
    before.close();
    const after = trackTestOwner(
      mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const found = attachOperationalModule(after, 'meetings-upgrade').read((db) =>
      db
        .prepare(`
          SELECT e.source_event_id FROM inbox_history_fts f
            JOIN source_events e ON e.rowid = f.rowid
           WHERE inbox_history_fts MATCH 'roadmap'
        `)
        .all(),
    );
    expect(found).toEqual([{ source_event_id: 'kept' }]);
  });

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
      callId: 'call-1',
      originChannelId: 'dm-ada',
      dispatcher,
    });
    expect(meeting).toMatchObject({ state: 'in-meeting', botSlug: 'ada', dispatcher });
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

    const ended = store.end(meeting.id, 'left', 'owner-stopped');
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
    expect(endedUnit.meeting?.ended).toBe('owner-stopped');
    expect(inboxLine(endedUnit)).toContain('Write the recap now');
    expect(inboxLine(endedUnit)).toContain('Channel dm-ada');

    expect(store.hear(meeting.id, { body: 'after it ended' })).toBeUndefined();
    expect(store.lines(meeting.id).map((line) => line.seq)).toEqual([1, 2]);
    expect(store.lines(meeting.id, 1).map((line) => line.body)).toEqual(['Ship on Friday?']);
    expect(store.get(meeting.id)).toMatchObject({ state: 'left', endReason: 'owner-stopped' });
    expect(store.live('ada')).toBeUndefined();
  });

  it('fails attendances a stopped Host left open and tells the Bot the meeting ended', () => {
    const { port, store } = storeFixture();
    const silent = store.create({
      botSlug: 'kai',
      platform: 'synthetic',
      callId: 'call-0',
      dispatcher,
    });
    const meeting = store.create({
      botSlug: 'ada',
      platform: 'synthetic',
      callId: 'call-1',
      dispatcher,
    });
    store.hear(meeting.id, { body: 'Ship on Friday?' });
    expect(store.failInterrupted()).toEqual([
      { id: silent.id, botSlug: 'kai', wake: false },
      { id: meeting.id, botSlug: 'ada', wake: true },
    ]);
    expect(store.get(meeting.id)).toMatchObject({ state: 'failed', endReason: 'host-stopped' });
    const rows = pendingMeetingRows(store, port);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.meeting_json).meeting).toMatchObject({ ended: 'host-stopped' });
  });

  it('starts a new Inbox batch instead of dropping unread lines', () => {
    const { port, store } = storeFixture();
    const meeting = store.create({
      botSlug: 'ada',
      platform: 'synthetic',
      callId: 'call-1',
      dispatcher,
    });
    for (let index = 1; index <= 201; index += 1) store.hear(meeting.id, { body: `line ${index}` });
    store.end(meeting.id, 'left', 'owner-stopped');
    const rows = pendingMeetingRows(store, port);
    expect(rows).toHaveLength(2);
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
    expect(units[0]!.meeting?.lines).toHaveLength(201);
    expect(units[0]!.meeting?.lines[0]!.body).toBe('line 1');
    expect(units[0]!.meeting?.ended).toBe('owner-stopped');
  });

  it('tells the Bot to read the transcript when a harvest leaves earlier meeting lines out', () => {
    const { port, store } = storeFixture();
    const meeting = store.create({
      botSlug: 'ada',
      platform: 'synthetic',
      callId: 'call-1',
      dispatcher,
    });
    for (let index = 1; index <= 4_001; index += 1)
      store.hear(meeting.id, { body: `line ${index}` });
    store.end(meeting.id, 'left', 'owner-stopped');
    expect(pendingMeetingRows(store, port)).toHaveLength(21);
    const harvest = createInboxHarvest({
      database: port,
      messagingEvents: { collectExternalRows: () => undefined },
    } as unknown as Parameters<typeof createInboxHarvest>[0]);
    const { units } = harvest.collectInbox('ada');
    expect(units).toHaveLength(1);
    expect(units[0]!.meeting).toMatchObject({ ended: 'owner-stopped', missed: true });
    expect(units[0]!.meeting?.lines[0]!.body).not.toBe('line 1');
    expect(inboxLine(units[0]!)).toContain(
      'Read the full transcript with meeting_transcript first.',
    );

    const short = store.create({
      botSlug: 'bea',
      platform: 'synthetic',
      callId: 'call-2',
      dispatcher,
    });
    store.hear(short.id, { body: 'only line' });
    store.end(short.id, 'left', 'owner-stopped');
    const [unit] = harvest.collectInbox('bea').units;
    expect(unit!.meeting?.missed).toBeUndefined();
    expect(inboxLine(unit!)).toContain('meeting_transcript if you need it');
  });

  it('wakes the Bot again when the meeting ends on a batch whose turn failed', () => {
    const { port, store } = storeFixture();
    const meeting = store.create({
      botSlug: 'ada',
      platform: 'synthetic',
      callId: 'call-1',
      dispatcher,
    });
    const heard = store.hear(meeting.id, { body: 'Ship on Friday?' })!;
    port.transaction((db) => {
      db.prepare(
        "UPDATE inbox_admissions SET attempt_state = 'retryable' WHERE source_event_id = ?",
      ).run(heard.sourceEventId);
    });
    expect(hasPendingMeetingSpeech(port, 'ada')).toBe(false);
    expect(store.end(meeting.id, 'left', 'owner-stopped')).toMatchObject({
      admitted: false,
      wake: true,
    });
    expect(hasPendingMeetingSpeech(port, 'ada')).toBe(true);
  });
});

function meetingsFixture(limits: { maxDurationMs?: number } = {}) {
  const { store, port } = storeFixture();
  const stopped: string[] = [];
  const admitted: string[] = [];
  const meetings = createMeetings({
    store,
    admitted: (slug) => admitted.push(slug),
    stopCall: async (callId) => {
      stopped.push(callId);
    },
    limits,
  });
  cleanup.push(() => meetings.dispose());
  const begin = (slug = 'ada', callId = 'call-1') =>
    meetings.begin({
      slug,
      callId,
      platform: 'owner-window',
      originChannelId: 'dm-ada',
      dispatcher,
    });
  return { store, port, meetings, stopped, admitted, begin };
}

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
  vi.useRealTimers();
});

describe('meetings', () => {
  it('starts listening with the call, one meeting per Bot', () => {
    const { begin, meetings } = meetingsFixture();
    const meeting = begin();
    expect(meeting).toMatchObject({
      state: 'in-meeting',
      platform: 'owner-window',
      callId: 'call-1',
    });
    expect(() => begin('ada', 'call-2')).toThrow(
      expect.objectContaining({ code: 'already-in-meeting' }),
    );
    expect(meetings.status('ada').live?.id).toBe(meeting.id);
  });

  it('ends with the call and wakes the Bot for the recap only after it heard something', () => {
    const { begin, meetings, store, admitted } = meetingsFixture();
    const silent = begin('ada', 'call-1');
    meetings.callEnded(silent.id, 'hangup');
    expect(store.get(silent.id)).toMatchObject({ state: 'left', endReason: 'owner-stopped' });
    expect(admitted).toEqual([]);

    const heard = begin('ada', 'call-2');
    meetings.hear(heard.id, 'Ship it on Friday');
    meetings.hear(heard.id, 'Agreed');
    expect(admitted).toEqual(['ada']);
    meetings.callEnded(heard.id, 'connection-lost');
    expect(store.get(heard.id)).toMatchObject({ state: 'failed', endReason: 'audio-lost' });
    expect(admitted).toEqual(['ada']);
  });

  it('keeps the Bot in the meeting when stopping the call fails, so leaving can be retried', async () => {
    const { store } = storeFixture();
    let fail = true;
    let meetings: ReturnType<typeof createMeetings>;
    const ended: string[] = [];
    meetings = createMeetings({
      store,
      admitted: () => undefined,
      stopCall: async () => {
        if (fail) throw new Error('helper offline');
        meetings.callEnded(meeting.id, 'hangup');
        ended.push('hangup');
      },
    });
    cleanup.push(() => meetings.dispose());
    const meeting = meetings.begin({
      slug: 'ada',
      callId: 'call-1',
      platform: 'owner-window',
      dispatcher,
    });
    await expect(meetings.leave('ada')).rejects.toThrow('helper offline');
    expect(store.get(meeting.id)?.state).toBe('in-meeting');
    fail = false;
    await expect(meetings.leave('ada')).resolves.toMatchObject({
      state: 'left',
      endReason: 'asked-to-leave',
    });
    expect(ended).toEqual(['hangup']);
  });

  it('retries the time limit when stopping the call fails', async () => {
    vi.useFakeTimers();
    const { store } = storeFixture();
    let attempts = 0;
    const meetings = createMeetings({
      store,
      admitted: () => undefined,
      stopCall: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('helper offline');
      },
      limits: { maxDurationMs: 1_000 },
    });
    cleanup.push(() => meetings.dispose());
    const meeting = meetings.begin({
      slug: 'ada',
      callId: 'call-1',
      platform: 'owner-window',
      dispatcher,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.get(meeting.id)?.state).toBe('in-meeting');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(attempts).toBe(2);
    expect(store.get(meeting.id)).toMatchObject({ state: 'left', endReason: 'time-limit' });
  });

  it('stops the call and retries the time limit when the attendance write fails', async () => {
    vi.useFakeTimers();
    const { store } = storeFixture();
    let writes = 0;
    const flaky = {
      ...store,
      end: (...args: Parameters<typeof store.end>) => {
        writes += 1;
        if (writes === 1) throw new Error('database is locked');
        return store.end(...args);
      },
    };
    const stopped: string[] = [];
    const meetings = createMeetings({
      store: flaky,
      admitted: () => undefined,
      stopCall: async (callId) => {
        stopped.push(callId);
      },
      limits: { maxDurationMs: 1_000 },
    });
    cleanup.push(() => meetings.dispose());
    const meeting = meetings.begin({
      slug: 'ada',
      callId: 'call-1',
      platform: 'owner-window',
      dispatcher,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(stopped).toEqual(['call-1']);
    expect(store.get(meeting.id)?.state).toBe('in-meeting');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.get(meeting.id)).toMatchObject({ state: 'left', endReason: 'time-limit' });
  });

  it('stops the call when the Bot leaves or the time limit passes', async () => {
    vi.useFakeTimers();
    const { begin, meetings, store, stopped } = meetingsFixture({ maxDurationMs: 1_000 });
    const asked = begin('ada', 'call-1');
    await expect(meetings.leave('ada')).resolves.toMatchObject({
      state: 'left',
      endReason: 'asked-to-leave',
    });
    meetings.callEnded(asked.id, 'hangup');
    expect(store.get(asked.id)?.endReason).toBe('asked-to-leave');
    await expect(meetings.leave('ada')).rejects.toMatchObject({ code: 'not-in-meeting' });

    const long = begin('ada', 'call-2');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.get(long.id)).toMatchObject({ state: 'left', endReason: 'time-limit' });
    expect(stopped).toEqual(['call-1', 'call-2']);
  });
});

describe('meeting commands', () => {
  it('reads only its own Bot transcripts', () => {
    const { begin, meetings, store } = meetingsFixture();
    const meeting = begin('ada');
    meetings.hear(meeting.id, 'hello');
    const ada = bindMeetingCommands({
      meetings,
      store,
      bot: { slug: 'ada' },
      markSideEffect: () => undefined,
    });
    const kai = bindMeetingCommands({
      meetings,
      store,
      bot: { slug: 'kai' },
      markSideEffect: () => undefined,
    });
    expect(ada.transcript({}).lines.map((line) => line.body)).toEqual(['hello']);
    expect(() => kai.transcript({ meetingId: meeting.id })).toThrow(
      expect.objectContaining({ code: 'not-in-meeting' }),
    );
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
    await runMeetingCommand('meeting-leave', ['ada'], { 'cause-event': 'evt-1' }, connect);
    await runMeetingCommand(
      'meeting-transcript',
      ['ada'],
      { meeting: 'meet-1', after: '3' },
      connect,
    );
    expect(calls).toEqual([
      ['botToolRun', { slug: 'ada', tool: 'meeting_leave', args: {}, sourceEventId: 'evt-1' }],
      [
        'botToolRun',
        { slug: 'ada', tool: 'meeting_transcript', args: { meeting_id: 'meet-1', after: 3 } },
      ],
    ]);
    await expect(
      runMeetingCommand('meeting-status', ['ada', 'extra'], {}, connect),
    ).rejects.toMatchObject({ code: 'usage' });
  });
});
