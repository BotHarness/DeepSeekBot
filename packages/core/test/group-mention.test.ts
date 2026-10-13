import { createBridgeMethods } from '../src/bridge/methods.js';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createCore } from '../src/plugin.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import type {
  AssignmentAgentRun,
  AssignmentRequestDelivery,
  BotAgentAdapter,
  OrchestratorAgentRun,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

describe('Group mention tracer', () => {
  it('rejects a Bot-authored all-Bot preview without writing Source Events or Admissions', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-all-bot-author-') });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Human shortcut only', members: ['ada'] });
      const preview = core.channels.previewAllBotMention(group.id);
      expect(preview.recipients).toHaveLength(1);
      await expect(
        core.channels.appendMessageOnce(
          group.id,
          {
            id: 'bot-all-attempt',
            at: '2026-10-03T00:00:00.000Z',
            author: { kind: 'bot', slug: 'ada' },
            body: '@Ada check',
            mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
          },
          preview,
        ),
      ).rejects.toThrow('All Bots requires a Human sender');
      expect(core.channels.readMessages(group.id)).toEqual([]);
      const counts = attachOperationalModule(core.operationalDatabase, 'all-bot-author-test').read(
        (db) => ({
          sources: db.prepare('SELECT COUNT(*) AS count FROM source_events').get(),
          placements: db.prepare('SELECT COUNT(*) AS count FROM channel_placements').get(),
          admissions: db.prepare('SELECT COUNT(*) AS count FROM inbox_admissions').get(),
        }),
      );
      expect(counts).toEqual({
        sources: { count: 0 },
        placements: { count: 0 },
        admissions: { count: 0 },
      });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('commits All Bots as ordinary mentions, survives replay after a member leaves, and reloads after restart', async () => {
    const home = createTempRoot('botharness-all-bot-');
    const runs: string[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        runs.push(run.bot.slug);
        await run.channels.send({ body: run.bot.displayName + ' received' });
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    let core = createCore({ dshHome: home, agents });
    try {
      for (const slug of ['ada', 'bea', 'outsider', 'paused'])
        core.registry.create({ slug, displayName: slug.toUpperCase() });
      core.registry.setPaused('paused', true);
      const group = core.channels.createGroup({
        name: 'All Bots Runtime',
        members: ['ada', 'bea', 'paused'],
      });
      for (const slug of ['ada', 'bea'])
        core.channels.setGroupWakePolicy(
          group.id,
          slug,
          { mode: 'silent', count: 10, intervalSeconds: 60 },
          { kind: 'human' },
        );
      const methods = createBridgeMethods({ ...core });
      const preview = methods.channelAllBotPreview({ channelId: group.id });
      if (!preview.ok) throw new Error('Expected preview');
      const request = {
        channelId: group.id,
        body: '@All Bots check',
        messageId: 'human-6cca0c89-e0ec-4074-8fcd-5b6f016dcb11',
        allBotMention: { start: 0, end: 9, label: 'All Bots', preview: preview.value },
      };
      const sent = await methods.channelSend(request);
      expect(sent).toMatchObject({ ok: true, value: { message: { body: '@ADA @BEA check' } } });
      await core.runtime.whenIdle();
      expect(runs.sort()).toEqual(['ada', 'bea']);
      expect(core.channels.message(group.id, request.messageId)?.deliveries).toEqual([
        { botSlug: 'ada', state: 'handled' },
        { botSlug: 'bea', state: 'handled' },
      ]);
      core.channels.removeGroupMember(group.id, 'bea');
      expect(await methods.channelSend(request)).toMatchObject({ ok: true });
      expect(
        core.channels.readMessages(group.id).filter((item) => item.id === request.messageId),
      ).toHaveLength(1);
      const stale = await methods.channelSend({
        ...request,
        messageId: 'human-61c22d15-2da9-4bc8-93c8-ece204ad31f9',
      });
      expect(stale).toMatchObject({ ok: false, error: { code: 'all-bot-preview-changed' } });
      await core.runtime.close();
      core.operationalDatabase.close();
      core = createCore({ dshHome: home, agents });
      expect(
        core.channels.message(group.id, request.messageId)?.mentions?.map((item) => item.botSlug),
      ).toEqual(['ada', 'bea']);
      expect(core.channels.previewAllBotMention(group.id).recipients).toEqual([
        { botSlug: 'ada', label: 'ADA' },
      ]);
      expect(await createBridgeMethods({ ...core }).channelSend(request)).toMatchObject({
        ok: true,
      });
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(2);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
  it('commits one Source Event and placement, wakes two independent Bot Inboxes, and replies in the Group', async () => {
    const home = createTempRoot('botharness-group-mention-');
    const runs: string[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run: OrchestratorAgentRun) {
        runs.push(run.bot.slug);
        expect(run.inboundChannelId).toBe('group-team');
        expect(run.message).toContain('@Ada');
        await run.channels.send({ body: `${run.bot.displayName} 已收到` });
      },
      async runAssignment(_run: AssignmentAgentRun) {},
      requestAssignment(_run: AssignmentAgentRun): AssignmentRequestDelivery {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
      expect(core.registry.create({ slug: 'bea', displayName: 'Bea' }).ok).toBe(true);
      const group = core.channels.createGroup({ name: 'Team', members: ['ada', 'bea'] });
      const body = '@Ada @Bea 请共同核对';
      const first = await core.channels.appendMessageOnce(group.id, {
        id: 'human-3c44062a-4083-4a74-aeaf-4ec98a4d29e1',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body,
        mentions: [
          { botSlug: 'ada', label: 'Ada', start: 0, end: 4 },
          { botSlug: 'bea', label: 'Bea', start: 5, end: 9 },
        ],
      });
      expect(first.status).toBe('appended');
      core.runtime.admitGroupMessage(group.id, 'human-3c44062a-4083-4a74-aeaf-4ec98a4d29e1');
      core.runtime.admitGroupMessage(group.id, 'human-3c44062a-4083-4a74-aeaf-4ec98a4d29e1');
      await core.runtime.whenIdle();
      expect(runs.sort()).toEqual(['ada', 'bea']);
      expect(core.channels.readMessages(group.id).map((item) => item.body)).toEqual([
        'Bea 已收到',
        'Ada 已收到',
        body,
      ]);
      const facts = attachOperationalModule(core.operationalDatabase, 'group-mention-test').read(
        (db) => {
          const source = db
            .prepare(
              'SELECT source_event_id FROM source_events WHERE channel_id = ? AND message_id = ?',
            )
            .all(group.id, 'human-3c44062a-4083-4a74-aeaf-4ec98a4d29e1');
          const placements = db
            .prepare(
              'SELECT source_event_id FROM channel_placements WHERE channel_id = ? AND message_id = ?',
            )
            .all(group.id, 'human-3c44062a-4083-4a74-aeaf-4ec98a4d29e1');
          const admissions = db
            .prepare(`
          SELECT bot_slug, attempt_state FROM inbox_admissions
          WHERE source_event_id = (SELECT source_event_id FROM source_events
            WHERE channel_id = ? AND message_id = ?) ORDER BY bot_slug
        `)
            .all(group.id, 'human-3c44062a-4083-4a74-aeaf-4ec98a4d29e1');
          return { source, placements, admissions };
        },
      );
      expect(facts.source).toHaveLength(1);
      expect(facts.placements).toHaveLength(1);
      expect(facts.admissions).toEqual([
        { bot_slug: 'ada', attempt_state: 'handled' },
        { bot_slug: 'bea', attempt_state: 'handled' },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('shows processing only after a claimed admission enters an Orchestrator turn', async () => {
    const home = createTempRoot('botharness-group-observation-');
    let enteredTurn = (): void => undefined;
    let releaseTurn = (): void => undefined;
    const entered = new Promise<void>((resolve) => {
      enteredTurn = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    const agents: BotAgentAdapter = {
      async runOrchestrator() {
        enteredTurn();
        await released;
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Observation', members: ['ada'] });
      await core.channels.appendMessageOnce(group.id, {
        id: 'observation-1',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: '@Ada please look',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      expect(core.channels.message(group.id, 'observation-1')?.deliveries).toEqual([
        { botSlug: 'ada', state: 'pending' },
      ]);
      const admissions = attachOperationalModule(core.operationalDatabase, 'observation-test');
      admissions.transaction((db) =>
        db
          .prepare("UPDATE inbox_admissions SET attempt_state = 'running' WHERE bot_slug = 'ada'")
          .run(),
      );
      expect(core.channels.message(group.id, 'observation-1')?.deliveries).toEqual([
        { botSlug: 'ada', state: 'pending' },
      ]);
      admissions.transaction((db) =>
        db
          .prepare("UPDATE inbox_admissions SET attempt_state = 'pending' WHERE bot_slug = 'ada'")
          .run(),
      );
      core.runtime.admitGroupMessage(group.id, 'observation-1');
      await entered;
      expect(core.channels.message(group.id, 'observation-1')?.deliveries).toEqual([
        { botSlug: 'ada', state: 'running' },
      ]);
      releaseTurn();
      await core.runtime.whenIdle();
      expect(core.channels.message(group.id, 'observation-1')?.deliveries).toEqual([
        { botSlug: 'ada', state: 'handled' },
      ]);
    } finally {
      releaseTurn();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
  it('keeps an active Human DM as processing while a Group claim awaits observation', async () => {
    const home = createTempRoot('botharness-delivery-dm-');
    let enteredTurn = (): void => undefined;
    let releaseTurn = (): void => undefined;
    const entered = new Promise<void>((resolve) => {
      enteredTurn = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    const agents: BotAgentAdapter = {
      async runOrchestrator() {
        enteredTurn();
        await released;
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'human-dm-observation',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Please help',
      });
      const admission = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'human-dm-observation',
        body: 'Please help',
      });
      expect(admission.admitted).toBe(true);
      await entered;
      expect(core.channels.message(dm.id, 'human-dm-observation')?.deliveries).toEqual([
        { botSlug: 'ada', state: 'running' },
      ]);
      releaseTurn();
      if (admission.admitted) await admission.settled;
    } finally {
      releaseTurn();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
  it('steers a direct Group mention into an active Orchestrator at its next safe step', async () => {
    const home = createTempRoot('botharness-group-steer-');
    let markStarted = (): void => undefined;
    let releaseTurn = (): void => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    const steered: string[] = [];
    const runs: string[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        if (run.inboundChannelId === undefined) throw new Error('Expected local inbound Channel');
        runs.push(run.inboundChannelId);
        markStarted();
        await released;
      },
      steerOrchestrator(botSlug, text) {
        expect(botSlug).toBe('ada');
        steered.push(text);
        return true;
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      const group = core.channels.createGroup({ name: 'Steer', members: ['ada'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'mentions',
        count: 5,
        intervalSeconds: 30,
      });
      await core.channels.appendMessage(dm.id, {
        id: 'dm-start',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Please continue working',
      });
      const dmAdmission = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'dm-start',
        body: 'Please continue working',
      });
      expect(dmAdmission.admitted).toBe(true);
      await started;
      await core.channels.appendMessage(group.id, {
        id: 'group-context',
        at: '2026-09-25T00:00:00.500Z',
        author: { kind: 'human' },
        body: 'The answer is STEER-17',
      });
      core.runtime.admitGroupMessage(group.id, 'group-context');
      await core.channels.appendMessage(group.id, {
        id: 'group-steer',
        at: '2026-09-25T00:00:01.000Z',
        author: { kind: 'human' },
        body: '@Ada check this',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      core.runtime.admitGroupMessage(group.id, 'group-steer');
      expect(steered).toHaveLength(1);
      expect(steered[0]).toContain(group.id);
      expect(steered[0]).toContain('The answer is STEER-17');
      expect(steered[0]).toContain('You may finish without replying');
      expect(core.channels.message(group.id, 'group-steer')?.deliveries).toEqual([
        { botSlug: 'ada', state: 'running' },
      ]);
      releaseTurn();
      if (dmAdmission.admitted) await dmAdmission.settled;
      await core.runtime.whenIdle();
      expect(runs).toEqual([dm.id]);
      expect(core.channels.readMessages(group.id).map((message) => message.id)).toEqual(
        expect.arrayContaining(['group-context', 'group-steer']),
      );
      expect(core.channels.message(group.id, 'group-context')?.deliveries).toEqual([
        { botSlug: 'ada', state: 'handled' },
      ]);
      expect(core.channels.message(group.id, 'group-steer')?.deliveries).toEqual([
        { botSlug: 'ada', state: 'handled' },
      ]);

      expect(
        core.attention
          .list({ botSlug: 'ada' })
          .items.filter((item) => item.sourceMessageId === 'group-steer')
          .map((item) => item.state),
      ).toEqual(['open']);
    } finally {
      releaseTurn();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('keeps other recipients running when one Bot fails', async () => {
    const home = createTempRoot('botharness-group-partial-');
    const runs: string[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        runs.push(run.bot.slug);
        if (run.bot.slug === 'ada') throw new Error('Ada unavailable');
        await run.channels.send({ body: 'Bea has replied' });
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = core.channels.createGroup({ name: 'Partial', members: ['ada', 'bea'] });
      const body = '@Ada @Bea work';
      await core.channels.appendMessageOnce(group.id, {
        id: 'human-cab241b9-2518-45a4-9eb6-5c6fc48730a2',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body,
        mentions: [
          { botSlug: 'ada', label: 'Ada', start: 0, end: 4 },
          { botSlug: 'bea', label: 'Bea', start: 5, end: 9 },
        ],
      });
      core.runtime.admitGroupMessage(group.id, 'human-cab241b9-2518-45a4-9eb6-5c6fc48730a2');
      await core.runtime.whenIdle();
      expect(runs.sort()).toEqual(['ada', 'bea']);
      expect(
        core.channels.readMessages(group.id).some((message) => message.body === 'Bea has replied'),
      ).toBe(true);
      const source = core.channels.message(group.id, 'human-cab241b9-2518-45a4-9eb6-5c6fc48730a2');
      expect(source?.deliveries).toEqual([
        { botSlug: 'ada', state: 'retryable' },
        { botSlug: 'bea', state: 'handled' },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('wakes a committed pending Group admission after restart', async () => {
    const home = createTempRoot('botharness-group-recovery-');
    const first = createCore({ dshHome: home });
    first.registry.create({ slug: 'ada', displayName: 'Ada' });
    const group = first.channels.createGroup({ name: 'Recovery', members: ['ada'] });
    await first.channels.appendMessageOnce(group.id, {
      id: 'human-3193c842-64cd-42b4-9699-68d10bc6f89a',
      at: '2026-09-25T00:00:00.000Z',
      author: { kind: 'human' },
      body: '@Ada resume',
      mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
    });
    await first.runtime.close();
    first.operationalDatabase.close();
    const runs: string[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        runs.push(run.bot.slug);
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const resumed = createCore({ dshHome: home, agents });
    try {
      await resumed.runtime.whenIdle();
      expect(runs).toEqual(['ada']);
      expect(
        resumed.channels.message(group.id, 'human-3193c842-64cd-42b4-9699-68d10bc6f89a')
          ?.deliveries,
      ).toEqual([{ botSlug: 'ada', state: 'handled' }]);
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  });

  it('upgrades a referenced Source Event table and imports legacy DM history without breaking Assignment links', async () => {
    const home = createTempRoot('botharness-channel-upgrade-');
    const priorPlan = defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 14),
    );
    const prior = mountOperationalDatabase({ dshHome: home, schemaPlan: priorPlan });
    const at = '2026-09-20T00:00:00.000Z';
    attachOperationalModule(prior, 'upgrade-fixture').transaction((db) => {
      db.prepare(`
        INSERT INTO session_ownership (session_id, bot_slug, root_role, created_at)
        VALUES ('assignment-old', 'ada', 'assignment', ?)
      `).run(at);
      db.prepare(`
        INSERT INTO source_events (
          source_event_id, source_kind, bot_slug, channel_id, message_id,
          body, created_at, attempt_state
        ) VALUES ('old-source', 'human-message', 'ada', 'dm-ada', 'old-message',
          'old body', ?, 'handled')
      `).run(at);
      db.prepare(`
        INSERT INTO assignments (
          session_id, source_event_id, bot_slug, purpose, activity, created_at, updated_at
        ) VALUES ('assignment-old', 'old-source', 'ada', 'old work', 'idle', ?, ?)
      `).run(at, at);
    });
    prior.close();
    const { createChannelStore } = await import('../src/channels/store.js');
    const legacy = createChannelStore({ rootDir: join(home, 'botharness', 'channels') });
    legacy.getOrCreateDm('ada', 'Ada');
    await legacy.appendMessage('dm-ada', {
      id: 'old-message',
      at,
      author: { kind: 'human' },
      body: 'old body',
    });
    await legacy.markRead('dm-ada', 'old-message');
    const core = createCore({ dshHome: home });
    try {
      expect(core.operationalDatabase.mode).toBe('ready');
      expect(core.channels.message('dm-ada', 'old-message')?.body).toBe('old body');
      expect(core.channels.readPosition('dm-ada')?.messageId).toBe('old-message');
      const migrated = attachOperationalModule(core.operationalDatabase, 'upgrade-check').read(
        (db) => ({
          refs: db.prepare('PRAGMA foreign_key_check').all(),
          assignment: db
            .prepare("SELECT source_event_id FROM assignments WHERE session_id = 'assignment-old'")
            .get(),
          source: db
            .prepare(
              "SELECT body, payload_json FROM source_events WHERE source_event_id = 'old-source'",
            )
            .get(),
          admission: db
            .prepare(
              "SELECT bot_slug, reason, attempt_state FROM inbox_admissions WHERE source_event_id = 'old-source'",
            )
            .get(),
        }),
      );
      expect(migrated.refs).toEqual([]);
      expect(migrated.assignment).toEqual({ source_event_id: 'old-source' });
      expect(migrated.admission).toEqual({
        bot_slug: 'ada',
        reason: 'human-dm',
        attempt_state: 'handled',
      });
      expect(migrated.source).toMatchObject({ body: 'old body' });
      expect((migrated.source as { payload_json: string }).payload_json).not.toContain('old body');
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('treats a Memory branch-switch target as part of a retried Channel message identity', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-channel-retry-') });
    try {
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      const first = {
        id: 'switch-message',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' as const },
        body: 'Switch branch',
        memorySwitchTarget: 'main',
      };
      expect((await core.channels.appendMessageOnce(dm.id, first)).status).toBe('appended');
      expect(
        (
          await core.channels.appendMessageOnce(dm.id, {
            ...first,
            memorySwitchTarget: 'experiment',
          })
        ).status,
      ).toBe('conflict');
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('imports old Channel history once and keeps SQL as the only subsequent authority', async () => {
    const home = createTempRoot('botharness-channel-import-');
    const { createChannelStore } = await import('../src/channels/store.js');
    const legacyRoot = join(home, 'botharness', 'channels');
    const legacy = createChannelStore({ rootDir: legacyRoot });
    const group = legacy.createGroup({ name: 'Legacy', members: ['ada'] });
    await legacy.appendMessage(group.id, {
      id: 'old-message',
      at: '2026-09-20T00:00:00.000Z',
      author: { kind: 'human' },
      body: 'earlier discussion',
    });
    const core = createCore({ dshHome: home });
    try {
      expect(core.channels.readMessages(group.id).map((message) => message.body)).toEqual([
        'earlier discussion',
      ]);
      await core.channels.appendMessage(group.id, {
        id: 'new-message',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'new discussion',
      });
      expect(legacy.readMessages(group.id).map((message) => message.body)).toEqual([
        'earlier discussion',
      ]);
      expect(core.channels.readMessages(group.id).map((message) => message.body)).toEqual([
        'new discussion',
        'earlier discussion',
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
