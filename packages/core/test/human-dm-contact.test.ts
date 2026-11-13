import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

describe('Human DM selected contact context', () => {
  it('gives the owner current bounded Bot identities without waking the selected contacts', async () => {
    const runs: OrchestratorAgentRun[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        runs.push(run);
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({
      dshHome: createTempRoot('botharness-human-contact-'),
      agents,
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({
        slug: 'bea',
        displayName: 'Alex',
        description: 'Coordinates release work',
      });
      core.registry.create({
        slug: 'cee',
        displayName: 'Alex',
        description: 'Reviews documentation',
      });
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
        registry: core.registry,
        states: core.states,
        channels: core.channels,

        ownership: core.ownership,
        roster: core.roster,
        runtime: core.runtime,
      });
      const body = '  @Alex @Alex please coordinate';
      const mentions = [
        { botSlug: 'bea', label: 'Alex', start: 2, end: 7 },
        { botSlug: 'cee', label: 'Alex', start: 8, end: 13 },
      ];
      expect(await methods.channelSend({ channelId: dm.id, body, mentions })).toMatchObject({
        ok: true,
        value: { message: { mentions } },
      });
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      expect(runs[0]!.bot.slug).toBe('ada');
      expect(runs[0]!.message).toContain('  \u2060@Alex \u2060@Alex');
      expect(runs[0]!.message).toContain('"id":"bea","name":"Alex"');
      expect(runs[0]!.message).toContain('"id":"cee","name":"Alex"');
      expect(runs[0]!.message).toContain('Coordinates release work');
      expect(runs[0]!.message).toContain('Reviews documentation');
      expect(core.channels.list().filter((channel) => channel.type === 'dm')).toHaveLength(1);

      core.registry.update('bea', { displayName: 'Bea New', description: 'Updated role' });
      const renamed = await methods.channelSend({
        channelId: dm.id,
        body: '@Alex ask again',
        mentions: [{ botSlug: 'bea', label: 'Alex', start: 0, end: 5 }],
      });
      expect(renamed.ok).toBe(true);
      await core.runtime.whenIdle();
      expect(runs[1]!.message).toContain('"id":"bea","name":"Bea New"');
      expect(runs[1]!.message).toContain('Updated role');

      expect(
        await methods.channelSend({ channelId: dm.id, body: '@Alex plain text' }),
      ).toMatchObject({ ok: true });
      await core.runtime.whenIdle();
      expect(runs[2]!.message).toContain('@Alex plain text');
      expect(runs[2]!.message).not.toContain('Selected PersonaBot contacts');

      core.registry.setPaused('cee', true);
      expect(
        await methods.channelSend({
          channelId: dm.id,
          body: '@Alex archived',
          mentions: [{ botSlug: 'cee', label: 'Alex', start: 0, end: 5 }],
        }),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
      expect(
        await methods.channelSend({
          channelId: dm.id,
          body: '@Ghost stale',
          mentions: [{ botSlug: 'ghost', label: 'Ghost', start: 0, end: 6 }],
        }),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
      expect(
        await methods.channelSend({
          channelId: dm.id,
          body: '@Ada self',
          mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
        }),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
      expect(runs).toHaveLength(3);
      const admissions = attachOperationalModule(
        core.operationalDatabase,
        'human-contact-test',
      ).read(
        (db) =>
          db.prepare('SELECT bot_slug FROM inbox_admissions ORDER BY bot_slug').all() as Array<{
            bot_slug: string;
          }>,
      );
      expect(admissions).toEqual([{ bot_slug: 'ada' }, { bot_slug: 'ada' }, { bot_slug: 'ada' }]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('admits repeated external Memory edits to the Bot Inbox in the same turn', async () => {
    const runs: OrchestratorAgentRun[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        runs.push(run);
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({
      dshHome: createTempRoot('botharness-annotation-'),
      agents,
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      const memoryDir = core.registry.memoryDirFor('ada');
      if (memoryDir === undefined) throw new Error('Memory dir missing');
      const send = async (id: string, body: string) => {
        await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
          id,
          at: '2026-09-26T00:00:00.000Z',
          author: { kind: 'human' },
          body,
        });
        core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, { channelId: dm.id, messageId: id, body });
        await core.runtime.whenIdle();
      };
      await send('m1', 'hello');
      expect(runs).toHaveLength(1);
      expect(runs[0]!.inbox).not.toContain('Memory change');
      writeFileSync(join(memoryDir, 'human-note.md'), 'Human wrote this\n');
      await send('m2', 'anything new?');
      expect(runs).toHaveLength(2);
      expect(runs[1]!.message).not.toContain('Memory changed since your last turn');
      expect(runs[1]!.inbox).toContain('Memory change');
      expect(runs[1]!.inbox).toContain('human-note.md');
      writeFileSync(join(memoryDir, 'human-note.md'), 'Human wrote something newer\n');
      await send('m3', 'and now?');
      expect(runs[2]!.inbox).toContain('human-note.md');
      const memoryEvents = attachOperationalModule(
        core.operationalDatabase,
        'human-contact-test',
      ).read(
        (db) =>
          db
            .prepare(`SELECT e.source_event_id, a.reason, a.attempt_state
            FROM source_events e JOIN inbox_admissions a
              ON a.source_event_id = e.source_event_id
           WHERE e.source_kind = 'memory-change' ORDER BY e.rowid`)
            .all() as Array<{
            source_event_id: string;
            reason: string;
            attempt_state: string;
          }>,
      );
      expect(memoryEvents).toHaveLength(2);
      expect(memoryEvents.every((event) => event.reason === 'memory-change')).toBe(true);
      expect(memoryEvents.every((event) => event.attempt_state === 'handled')).toBe(true);
      expect(
        core.attention
          .list({ botSlug: 'ada' })
          .items.filter((item) => item.reason === 'memory-change'),
      ).toHaveLength(2);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('recovers an offline Memory edit into Inbox before the next turn, once', async () => {
    const home = createTempRoot('botharness-memory-restart-');
    const runs: OrchestratorAgentRun[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        runs.push(run);
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    let core = createCore({ dshHome: home, agents });
    const send = async (id: string) => {
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        id,
        at: '2026-09-26T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'hello',
      });
      core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dm.id,
        messageId: id,
        body: 'hello',
      });
      await core.runtime.whenIdle();
    };
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      await send('initial');
      const memoryDir = core.registry.memoryDirFor('ada')!;
      await core.runtime.close();
      core.operationalDatabase.close();

      writeFileSync(join(memoryDir, 'offline.md'), 'Edited while Host was closed\n');
      core = createCore({ dshHome: home, agents });
      const pending = core.attention
        .list({ botSlug: 'ada' })
        .items.filter((item) => item.reason === 'memory-change');
      expect(pending).toHaveLength(1);
      expect(runs).toHaveLength(1);
      attachOperationalModule(core.operationalDatabase, 'memory-restart-test').transaction((db) => {
        db.prepare(
          "UPDATE source_events SET observed_at = '2026-09-26T00:00:00.000Z' WHERE source_kind = 'memory-change'",
        ).run();
        db.prepare(
          "UPDATE inbox_admissions SET observed_at = '2026-09-26T00:00:00.000Z', attempt_state = 'running' WHERE reason = 'memory-change'",
        ).run();
      });
      await core.runtime.close();
      core.operationalDatabase.close();

      core = createCore({ dshHome: home, agents });
      const recovered = attachOperationalModule(
        core.operationalDatabase,
        'memory-restart-test',
      ).read(
        (db) =>
          db
            .prepare(`SELECT e.observed_at AS event_observed, a.observed_at AS admission_observed,
                a.attempt_state FROM source_events e JOIN inbox_admissions a
                ON a.source_event_id = e.source_event_id WHERE e.source_kind = 'memory-change'`)
            .get() as {
            event_observed: string | null;
            admission_observed: string | null;
            attempt_state: string;
          },
      );
      expect(recovered).toEqual({
        event_observed: null,
        admission_observed: null,
        attempt_state: 'retryable',
      });
      expect(
        core.attention
          .list({ botSlug: 'ada' })
          .items.filter((item) => item.reason === 'memory-change'),
      ).toHaveLength(1);
      await send('after-restart');
      expect(runs).toHaveLength(2);
      expect(runs[1]!.inbox).toContain('offline.md');
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('keeps the old checkpoint when Memory Inbox admission fails', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-memory-atomic-') });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.runtime.reconcileMemoryChangesOnStartup?.();
      const memoryDir = core.registry.memoryDirFor('ada')!;
      const port = attachOperationalModule(core.operationalDatabase, 'memory-atomic-test');
      const checkpoint = () =>
        port.read(
          (db) =>
            db
              .prepare('SELECT observation_json FROM memory_change_checkpoints WHERE bot_slug = ?')
              .get('ada') as { observation_json: string },
        );
      const before = checkpoint().observation_json;
      writeFileSync(join(memoryDir, 'later.md'), 'Later edit\n');
      port.transaction((db) =>
        db.exec(`
        CREATE TRIGGER reject_memory_admission BEFORE INSERT ON inbox_admissions
        WHEN NEW.reason = 'memory-change'
        BEGIN SELECT RAISE(ABORT, 'simulated admission failure'); END;
      `),
      );
      core.runtime.reconcileMemoryChangesOnStartup?.();
      expect(checkpoint().observation_json).toBe(before);
      expect(
        core.attention
          .list({ botSlug: 'ada' })
          .items.filter((item) => item.reason === 'memory-change'),
      ).toHaveLength(0);
      port.transaction((db) => db.exec('DROP TRIGGER reject_memory_admission'));
      core.runtime.reconcileMemoryChangesOnStartup?.();
      expect(checkpoint().observation_json).not.toBe(before);
      expect(
        core.attention
          .list({ botSlug: 'ada' })
          .items.filter((item) => item.reason === 'memory-change'),
      ).toHaveLength(1);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
