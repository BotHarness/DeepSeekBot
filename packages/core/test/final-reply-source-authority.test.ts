import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createTempRoot } from './helpers.js';

const result = { action: 'reply' as const, text: 'Synthetic result', complete: true };

it('a scheduled wake has no implicit Human DM final destination', async () => {
  const core = createCore({
    dshHome: createTempRoot('final-schedule-authority-'),
    agents: {
      async runOrchestrator(run) {
        await run.replyFinal?.(result);
      },
      requestAssignment() {
        throw new Error('Assignments are outside this final-reply fixture');
      },
      async runAssignment() {},
      async close() {},
    },
  });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
    const schedule = core.schedules.create(
      'ada',
      {
        title: 'Synthetic wake',
        prompt: 'Report results',
        trigger: { kind: 'every', everySeconds: 3600 },
        enabled: false,
      },
      'human',
    );
    core.schedules.runNow('ada', schedule.id);
    await core.runtime.whenIdle();
    expect(core.channels.readMessages(dm.id).filter((m) => m.author.kind === 'bot')).toEqual([]);
    const rows = attachOperationalModule(core.operationalDatabase, 'final-schedule-test').read(
      (db) => db.prepare('SELECT resolved_at, final_reply_json FROM inbox_admissions').all(),
    );
    expect(rows).toEqual([
      expect.objectContaining({
        resolved_at: null,
        final_reply_json: expect.stringContaining('private-source-required'),
      }),
    ]);
  } finally {
    core.schedules.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('accepted steering of another source refuses automatic final instead of choosing a destination', async () => {
  let ready!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let runs = 0;
  const core = createCore({
    dshHome: createTempRoot('final-multisource-authority-'),
    agents: {
      async runOrchestrator(run) {
        if (++runs === 1) {
          ready();
          await held;
          await run.replyFinal?.(result);
        }
      },
      steerOrchestrator() {
        return true;
      },
      requestAssignment() {
        throw new Error('Assignments are outside this final-reply fixture');
      },
      async runAssignment() {},
      async close() {},
    },
  });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
    const admit = async (id: string) => {
      await core.channels.appendMessage(dm.id, {
        id,
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: id,
      });
      return core.runtime.admitDmMessage({ channelId: dm.id, messageId: id, body: id });
    };
    await admit('first');
    await started;
    await admit('second');
    release();
    await core.runtime.whenIdle();
    expect(core.channels.readMessages(dm.id).filter((m) => m.author.kind === 'bot')).toEqual([]);
    const rows = attachOperationalModule(core.operationalDatabase, 'final-multisource-test').read(
      (db) =>
        db
          .prepare(
            'SELECT resolved_at, final_reply_json FROM inbox_admissions ORDER BY source_event_id',
          )
          .all(),
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.resolved_at === null)).toBe(true);
    expect(
      rows.some((row) => String(row.final_reply_json).includes('source-not-unique-or-inactive')),
    ).toBe(true);
  } finally {
    release();
    core.schedules.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('a late local private final is attributed to its Human request in send status', async () => {
  let ready!: () => void;
  let release!: () => void;
  let runs = 0;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const core = createCore({
    dshHome: createTempRoot('final-late-local-status-'),
    agents: {
      async runOrchestrator(run) {
        runs++;
        ready();
        await held;
        await run.replyFinal?.(result);
      },
      steerOrchestrator() {
        return true;
      },
      requestAssignment() {
        throw new Error('Assignments are outside this final-reply fixture');
      },
      async runAssignment() {},
      async close() {},
    },
  });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
    const schedule = core.schedules.create(
      'ada',
      {
        title: 'Late local private source',
        prompt: 'Synthetic background work',
        trigger: { kind: 'every', everySeconds: 3600 },
        enabled: false,
      },
      'human',
    );
    core.schedules.runNow('ada', schedule.id);
    await started;
    const messageId = 'late-human';
    await core.channels.appendMessage(dm.id, {
      id: messageId,
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Reply to this input',
    });
    core.runtime.admitDmMessage({ channelId: dm.id, messageId, body: 'Reply to this input' });
    release();
    await core.runtime.whenIdle();
    expect(runs).toBe(1);
    const replies = core.channels
      .readMessages(dm.id)
      .filter((message) => message.author.kind === 'bot');
    expect(replies).toHaveLength(1);
    expect(replies[0]?.replyTo).toBe(messageId);
    const status = core.channels.humanSendStatus?.(dm.id, messageId);
    expect(status?.state).toBe('handled');
    expect(status?.replies.map((message) => message.id)).toEqual(
      replies.map((message) => message.id),
    );
    const origins = attachOperationalModule(
      core.operationalDatabase,
      'late-local-status-test',
    ).read((db) =>
      db
        .prepare(`SELECT origin.request_source_event_id FROM channel_output_origins origin
        JOIN source_events output ON output.source_event_id = origin.source_event_id
        WHERE output.channel_id = ? AND output.message_id = ?`)
        .all(dm.id, replies[0]!.id),
    );
    expect(origins).toEqual([{ request_source_event_id: status?.sourceEventId }]);
  } finally {
    release();
    core.schedules.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
