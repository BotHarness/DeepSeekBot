import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { isChannelRecord } from '../src/channels/channel.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function adapter(onRun: (run: OrchestratorAgentRun) => Promise<void>): BotAgentAdapter {
  return {
    runOrchestrator: onRun,
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
}

async function ordinary(
  core: ReturnType<typeof createCore>,
  channelId: string,
  id: string,
): Promise<void> {
  const message = await core.channels.appendMessage(channelId, {
    id,
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body: 'ordinary ' + id,
  });
  expect(message).toBeDefined();
  core.runtime.admitGroupMessage(channelId, id);
}

describe('Group ordinary-message digest', () => {
  it('defaults an unset Group preference to a durable digest without changing saved preferences', async () => {
    const home = createTempRoot('botharness-digest-default-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada', 'bea'] });
      core.channels.setGroupWakePolicy(group.id, 'bea', {
        mode: 'mentions',
        count: 5,
        intervalSeconds: 30,
      });
      await ordinary(core, group.id, 'first');
      await core.runtime.whenIdle();
      expect(runs).toEqual([]);
      expect(core.channels.get(group.id)?.wakePolicies).toMatchObject({
        bea: { mode: 'mentions', revision: 1 },
      });
      expect(core.channels.get(group.id)?.wakePolicies?.['ada']).toBeUndefined();
      expect(core.attention.list({ botSlug: 'ada' }).items).toMatchObject([
        { state: 'deferred', sourceMessageId: 'first' },
      ]);
      expect(core.attention.list({ botSlug: 'bea' }).items).toMatchObject([
        { state: 'pending', sourceMessageId: 'first' },
      ]);
      expect(
        attachOperationalModule(core.operationalDatabase, 'default-digest').read((db) =>
          db
            .prepare(
              "SELECT bot_slug, wake_count, wake_interval_ms, wake_policy_revision, wake_mode, source_policy_revision, source_policy_wake_mode FROM inbox_admissions WHERE reason = 'group-ordinary' ORDER BY bot_slug",
            )
            .all(),
        ),
      ).toEqual([
        {
          bot_slug: 'ada',
          wake_count: 5,
          wake_interval_ms: 30000,
          wake_policy_revision: 0,
          wake_mode: 'digest',
          source_policy_revision: 1,
          source_policy_wake_mode: 'digest',
        },
        {
          bot_slug: 'bea',
          wake_count: null,
          wake_interval_ms: null,
          wake_policy_revision: 1,
          wake_mode: 'mentions',
          source_policy_revision: 1,
          source_policy_wake_mode: 'digest',
        },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('applies a new PersonaBot Group default only to later Admissions and preserves a saved Channel override', async () => {
    const home = createTempRoot('botharness-group-source-default-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const inherited = core.channels.createGroup({ name: 'Inherited', members: ['ada'] });
      const overridden = core.channels.createGroup({ name: 'Overridden', members: ['ada'] });
      core.channels.setGroupWakePolicy(overridden.id, 'ada', {
        mode: 'mentions',
        count: 5,
        intervalSeconds: 30,
      });
      await ordinary(core, inherited.id, 'inherited-before');
      await ordinary(core, overridden.id, 'overridden-before');
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(0);
      core.sourcePolicy.setGroupOrdinary('ada', 'immediate', 7, 45, {
        kind: 'bot',
        botSlug: 'ada',
      });
      await ordinary(core, inherited.id, 'inherited-after');
      await ordinary(core, overridden.id, 'overridden-after');
      const deadline = Date.now() + 2000;
      while (runs.length === 0 && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 20));
      expect(runs).toHaveLength(1);
      expect(runs[0]).toContain('inherited-after');
      const rows = attachOperationalModule(core.operationalDatabase, 'group-source-default').read(
        (db) =>
          db
            .prepare(`
              SELECT e.message_id, a.source_policy_revision, a.source_policy_wake_mode,
                     a.wake_policy_revision, a.wake_mode
                FROM inbox_admissions a
                JOIN source_events e ON e.source_event_id = a.source_event_id
               WHERE a.reason = 'group-ordinary'
               ORDER BY e.message_id
            `)
            .all(),
      );
      expect(rows).toMatchObject([
        {
          message_id: 'inherited-after',
          source_policy_revision: 2,
          source_policy_wake_mode: 'immediate',
          wake_policy_revision: 0,
          wake_mode: 'all',
        },
        {
          message_id: 'inherited-before',
          source_policy_revision: 1,
          source_policy_wake_mode: 'digest',
          wake_policy_revision: 0,
          wake_mode: 'digest',
        },
        {
          message_id: 'overridden-after',
          source_policy_revision: 2,
          source_policy_wake_mode: 'immediate',
          wake_policy_revision: 1,
          wake_mode: 'mentions',
        },
        {
          message_id: 'overridden-before',
          source_policy_revision: 1,
          source_policy_wake_mode: 'digest',
          wake_policy_revision: 1,
          wake_mode: 'mentions',
        },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('keeps direct mentions immediate under silent and mentions source defaults', async () => {
    const home = createTempRoot('botharness-group-source-direct-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      core.sourcePolicy.setGroupOrdinary('ada', 'silent', 5, 30, { kind: 'human' });
      await ordinary(core, group.id, 'silent-one');
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(0);
      const sendMention = async (id: string): Promise<void> => {
        await core.channels.appendMessage(group.id, {
          id,
          at: new Date().toISOString(),
          author: { kind: 'human' },
          body: '@Ada please inspect',
          mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
        });
        core.runtime.admitGroupMessage(group.id, id);
        await core.runtime.whenIdle();
      };
      await sendMention('mention-under-silent');
      expect(runs).toHaveLength(1);
      expect(runs[0]).not.toContain('silent-one');
      core.sourcePolicy.setGroupOrdinary('ada', 'mentions', 5, 30, { kind: 'human' });
      await ordinary(core, group.id, 'mentions-one');
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      await sendMention('mention-under-mentions');
      expect(runs).toHaveLength(2);
      expect(runs[1]).toContain('mentions-one');
      expect(runs[1]).not.toContain('silent-one');
      expect(
        attachOperationalModule(core.operationalDatabase, 'source-direct-protection').read((db) =>
          db
            .prepare(`
              SELECT e.message_id, a.reason, a.wake_mode, a.source_policy_wake_mode
                FROM inbox_admissions a
                JOIN source_events e ON e.source_event_id = a.source_event_id
               WHERE e.message_id IN ('silent-one', 'mentions-one')
               ORDER BY e.message_id
            `)
            .all(),
        ),
      ).toMatchObject([
        {
          message_id: 'mentions-one',
          reason: 'group-ordinary',
          wake_mode: 'mentions',
          source_policy_wake_mode: 'mentions',
        },
        {
          message_id: 'silent-one',
          reason: 'group-ordinary',
          wake_mode: 'silent',
          source_policy_wake_mode: 'silent',
        },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('wakes on every ordinary message in all mode and persists the selected revision', async () => {
    const home = createTempRoot('botharness-attention-all-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      const methods = createBridgeMethods({ ...core });
      expect(
        methods.channelGroupWakeSet({
          channelId: group.id,
          botSlug: 'ada',
          mode: 'all',
          count: 5,
          intervalSeconds: 30,
        }),
      ).toMatchObject({
        ok: true,
        value: { channel: { wakePolicies: { ada: { mode: 'all', revision: 1 } } } },
      });
      await ordinary(core, group.id, 'one');
      await core.runtime.whenIdle();
      await ordinary(core, group.id, 'two');
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(2);
      expect(runs[0]).toContain('ordinary one');
      expect(runs[1]).toContain('ordinary two');
      expect(
        attachOperationalModule(core.operationalDatabase, 'attention-all').read((db) =>
          db
            .prepare(
              "SELECT wake_count, wake_interval_ms, wake_policy_revision FROM inbox_admissions WHERE reason = 'group-ordinary' ORDER BY source_event_id",
            )
            .all(),
        ),
      ).toEqual([
        { wake_count: 1, wake_interval_ms: 0, wake_policy_revision: 1 },
        { wake_count: 1, wake_interval_ms: 0, wake_policy_revision: 1 },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('wakes a new all-mode message without waiting for an older digest revision', async () => {
    const home = createTempRoot('botharness-attention-switch-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      await ordinary(core, group.id, 'before-switch');
      await core.runtime.whenIdle();
      expect(runs).toEqual([]);

      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'all',
        count: 5,
        intervalSeconds: 30,
      });
      await ordinary(core, group.id, 'after-switch');
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toContain('ordinary after-switch');
      expect(runs[0]).toContain('ordinary before-switch');

      const switched = core.attention.list({ botSlug: 'ada' }).items;
      expect(switched).toHaveLength(2);
      expect(switched).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sourceMessageId: 'after-switch', state: 'handled' }),
          expect.objectContaining({ sourceMessageId: 'before-switch', state: 'handled' }),
        ]),
      );
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('wakes on the count threshold, observes two messages in one turn, and requires no reply', async () => {
    const home = createTempRoot('botharness-digest-count-');
    const runs: OrchestratorAgentRun[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run);
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'digest',
        count: 2,
        intervalSeconds: 3600,
      });
      await ordinary(core, group.id, 'one');
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(0);
      await ordinary(core, group.id, 'two');
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      expect(runs[0]?.message).toContain('ordinary one');
      expect(runs[0]?.message).toContain('ordinary two');
      expect(runs[0]?.message).toContain('respond only if useful');
      const messages = core.channels.readMessages(group.id);
      expect(messages).toHaveLength(2);
      expect(messages.every((message) => message.author.kind === 'human')).toBe(true);
      const facts = attachOperationalModule(core.operationalDatabase, 'digest-test').read((db) =>
        db
          .prepare(
            "SELECT attempt_state, observed_at, wake_count FROM inbox_admissions WHERE reason = 'group-ordinary' ORDER BY source_event_id",
          )
          .all(),
      );
      expect(facts).toEqual([
        { attempt_state: 'handled', observed_at: expect.any(String), wake_count: 2 },
        { attempt_state: 'handled', observed_at: expect.any(String), wake_count: 2 },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('keeps direct mentions immediate even when ordinary Group messages use a digest', async () => {
    const home = createTempRoot('botharness-digest-mention-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'digest',
        count: 5,
        intervalSeconds: 3600,
      });
      await core.channels.appendMessage(group.id, {
        id: 'mention',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Ada please inspect',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      core.runtime.admitGroupMessage(group.id, 'mention');
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toContain('direct Group mention');
      const facts = attachOperationalModule(core.operationalDatabase, 'digest-test').read((db) =>
        db.prepare('SELECT reason FROM inbox_admissions').all(),
      );
      expect(facts).toEqual([{ reason: 'group-mention' }]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('delivers a nonempty digest after the interval and recovers its timer after restart', async () => {
    const home = createTempRoot('botharness-digest-restart-');
    const before = createCore({ dshHome: home, agents: adapter(async () => {}) });
    let groupId = '';
    try {
      before.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = before.channels.createGroup({ name: 'Team', members: ['ada'] });
      groupId = group.id;
      before.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'digest',
        count: 5,
        intervalSeconds: 1,
      });
      await ordinary(before, group.id, 'only-one');
    } finally {
      await before.runtime.close();
      before.operationalDatabase.close();
    }
    const runs: string[] = [];
    const resumed = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
      }),
    });
    try {
      const deadline = Date.now() + 3000;
      while (runs.length === 0 && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 50));
      await resumed.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toContain('ordinary only-one');
      expect(resumed.channels.readMessages(groupId)[0]?.deliveries).toEqual([
        { botSlug: 'ada', state: 'handled' },
      ]);
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  });

  it('waits for the current turn and then delivers a due digest', async () => {
    const home = createTempRoot('botharness-digest-busy-');
    let release = (): void => undefined;
    let started = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
        if (run.message.endsWith('Hold')) {
          started();
          await gate;
        }
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'digest',
        count: 2,
        intervalSeconds: 3600,
      });
      await core.channels.appendMessage(dm.id, {
        id: 'hold',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Hold',
      });
      core.runtime.admitDmMessage({ channelId: dm.id, messageId: 'hold', body: 'Hold' });
      await began;
      await ordinary(core, group.id, 'one');
      await ordinary(core, group.id, 'two');
      expect(runs).toEqual(['[Human DM]\nChannel: ' + dm.id + '\nMessage ID: hold\nHold']);
      release();
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(2);
      expect(runs[1]).toContain('ordinary one');
    } finally {
      release();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('validates the Human policy command and re-arms a due digest after resume', async () => {
    const home = createTempRoot('botharness-digest-resume-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      const methods = createBridgeMethods({ ...core });
      expect(
        methods.channelGroupWakeSet({
          channelId: group.id,
          botSlug: 'outsider',
          mode: 'digest',
          count: 5,
          intervalSeconds: 1,
        }),
      ).toMatchObject({ ok: false });
      expect(
        methods.channelGroupWakeSet({
          channelId: group.id,
          botSlug: 'ada',
          mode: 'digest',
          count: 5,
          intervalSeconds: 1,
        }),
      ).toMatchObject({
        ok: true,
        value: { channel: { wakePolicies: { ada: { mode: 'digest', revision: 1 } } } },
      });
      await ordinary(core, group.id, 'waiting');
      expect(methods.pause({ slug: 'ada' })).toMatchObject({ ok: true });
      await new Promise((resolve) => setTimeout(resolve, 1200));
      expect(runs).toHaveLength(0);
      expect(methods.resume({ slug: 'ada' })).toMatchObject({ ok: true });
      const deadline = Date.now() + 3000;
      while (runs.length === 0 && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 50));
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toContain('ordinary waiting');
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
  it('keeps a failed no-side-effect digest retryable with a bounded delay', async () => {
    const home = createTempRoot('botharness-digest-retry-');
    let attempts = 0;
    const core = createCore({
      dshHome: home,
      agents: adapter(async () => {
        attempts += 1;
        throw new Error('Temporary provider failure');
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'digest',
        count: 1,
        intervalSeconds: 3600,
      });
      await ordinary(core, group.id, 'retry-me');
      await core.runtime.whenIdle();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(attempts).toBe(1);
      const facts = attachOperationalModule(core.operationalDatabase, 'digest-retry').read((db) =>
        db
          .prepare(
            "SELECT attempt_state, side_effect_started_at FROM inbox_admissions WHERE reason = 'group-ordinary'",
          )
          .get(),
      );
      expect(facts).toEqual({ attempt_state: 'retryable', side_effect_started_at: null });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('commits Group history without admitting a paused Bot and keeps active peers independent', async () => {
    const home = createTempRoot('botharness-archived-ordinary-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada', 'bea'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'silent',
        count: 5,
        intervalSeconds: 60,
      });
      core.channels.setGroupWakePolicy(group.id, 'bea', {
        mode: 'silent',
        count: 5,
        intervalSeconds: 60,
      });
      const methods = createBridgeMethods({ ...core });
      expect(methods.pause({ slug: 'ada' })).toMatchObject({ ok: true });
      await ordinary(core, group.id, 'while-ada-paused');
      await core.runtime.whenIdle();
      expect(core.channels.readMessages(group.id)).toHaveLength(1);
      expect(core.attention.list({ botSlug: 'ada' }).items).toEqual([]);
      expect(core.attention.list({ botSlug: 'bea' }).items).toMatchObject([
        { state: 'pending', sourceMessageId: 'while-ada-paused' },
      ]);
      expect(runs).toEqual([]);
      expect(methods.resume({ slug: 'ada' })).toMatchObject({ ok: true });
      expect(core.attention.list({ botSlug: 'ada' }).items).toEqual([]);
      await ordinary(core, group.id, 'after-ada-resumed');
      expect(core.attention.list({ botSlug: 'ada' }).items).toMatchObject([
        { state: 'pending', sourceMessageId: 'after-ada-resumed' },
      ]);
      expect(core.attention.list({ botSlug: 'bea' }).items).toHaveLength(2);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('keeps silent ordinary admissions durable without waking, including after restart, while direct @ still wakes', async () => {
    const home = createTempRoot('botharness-silent-restart-');
    const beforeRuns: string[] = [];
    const before = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        beforeRuns.push(run.message);
      }),
    });
    let groupId = '';
    try {
      before.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = before.channels.createGroup({ name: 'Team', members: ['ada'] });
      groupId = group.id;
      const methods = createBridgeMethods({ ...before });
      expect(
        methods.channelGroupWakeSet({
          channelId: group.id,
          botSlug: 'ada',
          mode: 'silent',
          count: 5,
          intervalSeconds: 1,
        }),
      ).toMatchObject({
        ok: true,
        value: { channel: { wakePolicies: { ada: { mode: 'silent', revision: 1 } } } },
      });
      await ordinary(before, group.id, 'quiet');
      await before.runtime.whenIdle();
      expect(beforeRuns).toEqual([]);
      expect(before.attention.list({ botSlug: 'ada' }).items[0]?.state).toBe('pending');
      expect(
        attachOperationalModule(before.operationalDatabase, 'silent-test').read((db) =>
          db
            .prepare(
              "SELECT attempt_state, observed_at, wake_count, wake_interval_ms, wake_policy_revision FROM inbox_admissions WHERE reason = 'group-ordinary'",
            )
            .get(),
        ),
      ).toEqual({
        attempt_state: 'pending',
        observed_at: null,
        wake_count: null,
        wake_interval_ms: null,
        wake_policy_revision: 1,
      });
    } finally {
      await before.runtime.close();
      before.operationalDatabase.close();
    }
    const afterRuns: string[] = [];
    const after = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        afterRuns.push(run.message);
      }),
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await after.runtime.whenIdle();
      expect(afterRuns).toEqual([]);
      await after.channels.appendMessage(groupId, {
        id: 'mention-after-silent',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Ada please inspect',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      after.runtime.admitGroupMessage(groupId, 'mention-after-silent');
      await after.runtime.whenIdle();
      expect(afterRuns).toHaveLength(1);
      expect(afterRuns[0]).toContain('direct Group mention');
      expect(afterRuns[0]).not.toContain('ordinary quiet');

      const resumedAttention = after.attention.list({ botSlug: 'ada' }).items;
      expect(resumedAttention).toHaveLength(2);
      expect(resumedAttention).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sourceMessageId: 'mention-after-silent', state: 'open' }),
          expect.objectContaining({ sourceMessageId: 'quiet', state: 'pending' }),
        ]),
      );
    } finally {
      await after.runtime.close();
      after.operationalDatabase.close();
    }
  });

  it('does not include old silent admissions in a later digest threshold', async () => {
    const home = createTempRoot('botharness-silent-to-digest-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'silent',
        count: 5,
        intervalSeconds: 3600,
      });
      await ordinary(core, group.id, 'old-silent');
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'digest',
        count: 2,
        intervalSeconds: 3600,
      });
      await ordinary(core, group.id, 'new-one');
      await core.runtime.whenIdle();
      expect(runs).toEqual([]);
      await ordinary(core, group.id, 'new-two');
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toContain('ordinary new-one');
      expect(runs[0]).toContain('ordinary new-two');
      const rows = attachOperationalModule(core.operationalDatabase, 'silent-switch').read((db) =>
        db
          .prepare(
            "SELECT e.message_id, a.attempt_state, a.wake_count FROM inbox_admissions a JOIN source_events e ON e.source_event_id = a.source_event_id WHERE a.reason = 'group-ordinary' ORDER BY e.rowid",
          )
          .all(),
      );
      expect(rows).toEqual([
        { message_id: 'old-silent', attempt_state: 'pending', wake_count: null },
        { message_id: 'new-one', attempt_state: 'handled', wake_count: 2 },
        { message_id: 'new-two', attempt_state: 'handled', wake_count: 2 },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('revokes pending digest admission when a member leaves and keeps deleted records valid', async () => {
    const home = createTempRoot('botharness-digest-revoke-');
    const core = createCore({ dshHome: home, agents: adapter(async () => {}) });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'digest',
        count: 5,
        intervalSeconds: 3600,
      });
      await ordinary(core, group.id, 'pending');
      core.channels.removeGroupMember(group.id, 'ada');
      const fact = attachOperationalModule(core.operationalDatabase, 'digest-revoke').read((db) =>
        db
          .prepare("SELECT attempt_state FROM inbox_admissions WHERE reason = 'group-ordinary'")
          .get(),
      );
      expect(fact).toEqual({ attempt_state: 'handled' });
      const second = core.channels.createGroup({ name: 'Another', members: ['ada'] });
      core.channels.setGroupWakePolicy(second.id, 'ada', {
        mode: 'digest',
        count: 2,
        intervalSeconds: 3600,
      });
      core.channels.deleteGroup(second.id);
      const record = attachOperationalModule(core.operationalDatabase, 'digest-delete').read((db) =>
        db.prepare('SELECT record_json FROM channel_records WHERE channel_id = ?').get(second.id),
      ) as { record_json: string };
      expect(isChannelRecord(JSON.parse(record.record_json), second.id)).toBe(true);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('orders digest sections by first pending message across Channels', async () => {
    const home = createTempRoot('botharness-digest-order-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });

      const earlier = core.channels.createGroup({ name: 'Zebra', members: ['ada'] });
      const later = core.channels.createGroup({ name: 'Alpha', members: ['ada'] });
      for (const group of [earlier, later])
        core.channels.setGroupWakePolicy(group.id, 'ada', {
          mode: 'digest',
          count: 1,
          intervalSeconds: 3600,
        });
      await core.channels.appendMessage(later.id, {
        id: 'later-1',
        at: '2026-09-26T00:00:10.000Z',
        author: { kind: 'human' },
        body: 'ordinary later',
      });
      await core.channels.appendMessage(earlier.id, {
        id: 'earlier-1',
        at: '2026-09-26T00:00:09.000Z',
        author: { kind: 'human' },
        body: 'ordinary earlier',
      });
      core.runtime.admitGroupMessage(later.id, 'later-1');
      core.runtime.admitGroupMessage(earlier.id, 'earlier-1');
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      const prompt = runs[0] ?? '';
      expect(prompt).toContain(earlier.id);
      expect(prompt).toContain(later.id);
      expect(prompt.indexOf(earlier.id)).toBeLessThan(prompt.indexOf(later.id));
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
