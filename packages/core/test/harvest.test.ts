import { describe, expect, it } from 'vitest';

import { createCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import type {
  AssignmentAgentRun,
  AssignmentRequestDelivery,
  BotAgentAdapter,
  OrchestratorAgentRun,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function admissionStates(core: ReturnType<typeof createCore>, botSlug: string): string[] {
  return (
    attachOperationalModule(core.operationalDatabase, 'harvest-test').read((db) =>
      db
        .prepare('SELECT attempt_state FROM inbox_admissions WHERE bot_slug = ? ORDER BY rowid')
        .all(botSlug),
    ) as unknown as Array<{ attempt_state: string }>
  ).map((row) => row.attempt_state);
}

function admissionStateFor(
  core: ReturnType<typeof createCore>,
  botSlug: string,
  messageId: string,
): string | undefined {
  return (
    attachOperationalModule(core.operationalDatabase, 'harvest-test').read((db) =>
      db
        .prepare(`SELECT a.attempt_state FROM inbox_admissions a
          JOIN source_events e ON e.source_event_id = a.source_event_id
          WHERE a.bot_slug = ? AND e.message_id = ?`)
        .get(botSlug, messageId),
    ) as { attempt_state: string } | undefined
  )?.attempt_state;
}

async function admitMention(
  core: ReturnType<typeof createCore>,
  groupId: string,
  id: string,
  body: string,
): Promise<void> {
  await core.channels.appendMessageOnce(groupId, {
    id,
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body,
    mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
  });
}

function admit(core: ReturnType<typeof createCore>, groupId: string, id: string): void {
  core.runtime.admitGroupMessage(groupId, id);
}

describe('turn-time harvest', () => {
  it('handles only the silent Group messages returned by channel_read after a successful turn', async () => {
    const home = createTempRoot('botharness-silent-read-settlement-');
    let groupId = '';
    const core = createCore({
      dshHome: home,
      agents: {
        async runOrchestrator(run) {
          const page = run.channels.query({ channelId: groupId, text: 'READ_ME', limit: 1 });
          expect(page.messages.map((item) => item.message.id)).toEqual(['silent-2']);
          expect(page.nextCursor).toBeDefined();
          expect(
            core.attention
              .list({ botSlug: 'ada' })
              .items.find((item) => item.sourceMessageId === 'silent-2')?.state,
          ).toBe('processing');
          run.channels.list({ channelId: groupId });
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('No Assignment expected');
        },
        async close() {},
      },
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Silent', members: ['ada'] });
      groupId = group.id;
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'silent',
        count: 5,
        intervalSeconds: 30,
      });
      for (const [id, body] of [
        ['silent-1', 'READ_ME first'],
        ['silent-2', 'READ_ME second'],
        ['silent-3', 'UNREAD third'],
      ] as const) {
        await core.channels.appendMessageOnce(group.id, {
          id,
          at: new Date().toISOString(),
          author: { kind: 'human' },
          body,
        });
        admit(core, group.id, id);
      }
      await core.runtime.whenIdle();
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessageOnce(dm.id, {
        id: 'read-trigger',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Read one matching Group message',
      });
      core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'read-trigger',
        body: 'Read one matching Group message',
      });
      await core.runtime.whenIdle();
      expect(admissionStateFor(core, 'ada', 'silent-2')).toBe('handled');
      expect(admissionStateFor(core, 'ada', 'silent-1')).toBe('pending');
      expect(admissionStateFor(core, 'ada', 'silent-3')).toBe('pending');
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('leaves a returned silent Group message needing repair when the turn fails', async () => {
    const home = createTempRoot('botharness-silent-read-failure-');
    let groupId = '';
    const core = createCore({
      dshHome: home,
      agents: {
        async runOrchestrator(run) {
          expect(
            run.channels.read({ channelId: groupId, limit: 1 }).map((item) => item.message.id),
          ).toEqual(['silent-failure']);
          throw new Error('Model failed after read');
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('No Assignment expected');
        },
        async close() {},
      },
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Silent', members: ['ada'] });
      groupId = group.id;
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'silent',
        count: 5,
        intervalSeconds: 30,
      });
      await core.channels.appendMessageOnce(group.id, {
        id: 'silent-failure',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Read then fail',
      });
      admit(core, group.id, 'silent-failure');
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessageOnce(dm.id, {
        id: 'failure-trigger',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Read Group history',
      });
      core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'failure-trigger',
        body: 'Read Group history',
      });
      await core.runtime.whenIdle();
      expect(admissionStateFor(core, 'ada', 'silent-failure')).toBe('needs-repair');
      expect(
        core.attention
          .list({ botSlug: 'ada' })
          .items.find((item) => item.sourceMessageId === 'silent-failure')?.state,
      ).toBe('needs-repair');
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('advances the oldest slice across turns while bounding a 120-message Group backlog', async () => {
    const home = createTempRoot('botharness-mentions-backlog-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: {
        async runOrchestrator(run) {
          runs.push(run.message);
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('No Assignment expected');
        },
        async close() {},
      },
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Backlog', members: ['ada'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'mentions',
        count: 5,
        intervalSeconds: 30,
      });
      for (let index = 0; index < 120; index += 1) {
        const id = `backlog-${index}`;
        await core.channels.appendMessageOnce(group.id, {
          id,
          at: new Date(Date.now() + index).toISOString(),
          author: { kind: 'human' },
          body: index === 0 ? `Oldest ${'X'.repeat(20_000)}` : `Pending ${id} ${'Y'.repeat(600)}`,
        });
        admit(core, group.id, id);
      }
      await core.runtime.whenIdle();
      expect(runs).toEqual([]);
      await admitMention(core, group.id, 'backlog-trigger-1', '@Ada catch up');
      admit(core, group.id, 'backlog-trigger-1');
      await core.runtime.whenIdle();

      expect(runs).toHaveLength(1);
      expect(runs[0]).toContain('Message ID: backlog-trigger-1');
      expect(runs[0]).toContain('Message backlog-0');
      expect(runs[0]).not.toContain('Message backlog-119');
      expect(runs[0]).toContain('remain pending');
      expect(runs[0]?.length).toBeLessThan(25_000);
      expect(admissionStateFor(core, 'ada', 'backlog-0')).toBe('handled');
      expect(admissionStateFor(core, 'ada', 'backlog-50')).toBe('pending');
      let firstPending = 0;
      while (admissionStateFor(core, 'ada', `backlog-${firstPending}`) === 'handled')
        firstPending += 1;

      await admitMention(core, group.id, 'backlog-trigger-2', '@Ada continue catching up');
      admit(core, group.id, 'backlog-trigger-2');
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(2);
      expect(runs[1]).toContain(`Message backlog-${firstPending}`);
      expect(admissionStateFor(core, 'ada', `backlog-${firstPending}`)).toBe('handled');
      expect(admissionStateFor(core, 'ada', 'backlog-119')).toBe('pending');
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('shares the text budget across two Group Channels in one harvest', async () => {
    const home = createTempRoot('botharness-context-budget-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: {
        async runOrchestrator(run) {
          runs.push(run.message);
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('No Assignment expected');
        },
        async close() {},
      },
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const groups = [
        core.channels.createGroup({ name: 'Alpha', members: ['ada'] }),
        core.channels.createGroup({ name: 'Beta', members: ['ada'] }),
      ];
      for (const group of groups) {
        core.channels.setGroupWakePolicy(group.id, 'ada', {
          mode: 'mentions',
          count: 5,
          intervalSeconds: 30,
        });
        for (let index = 0; index < 20; index += 1) {
          const id = `${group.id}-${index}`;
          await core.channels.appendMessageOnce(group.id, {
            id,
            at: new Date(Date.now() + index).toISOString(),
            author: { kind: 'human' },
            body: `${id} ${'Z'.repeat(900)}`,
          });
          admit(core, group.id, id);
        }
      }
      await core.runtime.whenIdle();
      for (const group of groups) {
        const id = `${group.id}-trigger`;
        await admitMention(core, group.id, id, '@Ada check this Group');
        admit(core, group.id, id);
      }
      await core.runtime.whenIdle();

      expect(runs).toHaveLength(1);
      expect(runs[0]?.length).toBeLessThan(24_100);
      expect(runs[0]).toContain(`Message ${groups[0]?.id}-0`);
      expect(runs[0]).toContain(`Message ${groups[1]?.id}-0`);
      expect(admissionStateFor(core, 'ada', `${groups[1]?.id}-15`)).toBe('pending');
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('brings pending mentions-mode Group context into the same turn as a direct mention', async () => {
    const home = createTempRoot('botharness-mentions-context-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: {
        async runOrchestrator(run) {
          runs.push(run.message);
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('No Assignment expected');
        },
        async close() {},
      },
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'mentions',
        count: 5,
        intervalSeconds: 30,
      });
      await core.channels.appendMessageOnce(group.id, {
        id: 'prior-context',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'The release code is BLUE-17',
      });
      admit(core, group.id, 'prior-context');
      await core.runtime.whenIdle();
      expect(runs).toEqual([]);
      expect(admissionStates(core, 'ada')).toEqual(['pending']);
      await admitMention(core, group.id, 'context-trigger', '@Ada what is the release code?');
      admit(core, group.id, 'context-trigger');
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toContain('Message ID: context-trigger');
      expect(runs[0]).toContain('The release code is BLUE-17');
      expect(admissionStates(core, 'ada')).toEqual(['handled', 'handled']);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('coalesces two pending mentions into one harvest turn', async () => {
    const home = createTempRoot('botharness-harvest-');
    const runs: OrchestratorAgentRun[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        runs.push(run);
      },
      async runAssignment(_run: AssignmentAgentRun) {},
      requestAssignment(_run: AssignmentAgentRun): AssignmentRequestDelivery {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      await core.channels.appendMessageOnce(group.id, {
        id: 'harvest-m1',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Ada first',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      await core.channels.appendMessageOnce(group.id, {
        id: 'harvest-m2',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Ada second',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      core.runtime.admitGroupMessage(group.id, 'harvest-m1');
      core.runtime.admitGroupMessage(group.id, 'harvest-m2');
      await core.runtime.whenIdle();

      expect(runs).toHaveLength(1);
      const message = runs[0]?.message ?? '';
      expect(message.startsWith('[Bot Inbox harvest] 2 attention items are ready.')).toBe(true);
      expect(message).toContain('Message ID: harvest-m1');
      expect(message).toContain('Message ID: harvest-m2');
      expect(admissionStates(core, 'ada')).toEqual(['handled', 'handled']);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('keeps a single item free of the harvest preamble', async () => {
    const home = createTempRoot('botharness-harvest-single-');
    const runs: OrchestratorAgentRun[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        runs.push(run);
      },
      async runAssignment(_run: AssignmentAgentRun) {},
      requestAssignment(_run: AssignmentAgentRun): AssignmentRequestDelivery {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      await core.channels.appendMessageOnce(group.id, {
        id: 'harvest-single',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Ada solo',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      core.runtime.admitGroupMessage(group.id, 'harvest-single');
      await core.runtime.whenIdle();

      expect(runs).toHaveLength(1);
      const message = runs[0]?.message ?? '';
      expect(message).not.toContain('[Bot Inbox harvest]');
      expect(message).toMatch(/^Source Event ID: [^\n]+\n\[Bot Inbox: direct Group mention/);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('harvests a due digest batch together with a mention', async () => {
    const home = createTempRoot('botharness-harvest-digest-');
    const runs: OrchestratorAgentRun[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        runs.push(run);
      },
      async runAssignment(_run: AssignmentAgentRun) {},
      requestAssignment(_run: AssignmentAgentRun): AssignmentRequestDelivery {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'digest',
        count: 1,
        intervalSeconds: 30,
      });
      await core.channels.appendMessageOnce(group.id, {
        id: 'harvest-o1',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'ordinary chatter',
      });
      await core.channels.appendMessageOnce(group.id, {
        id: 'harvest-m1',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Ada ping',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      core.runtime.admitGroupMessage(group.id, 'harvest-o1');
      core.runtime.admitGroupMessage(group.id, 'harvest-m1');
      await core.runtime.whenIdle();

      expect(runs).toHaveLength(1);
      const message = runs[0]?.message ?? '';
      expect(message).toContain('[Bot Inbox harvest]');
      expect(message).toContain('Message ID: harvest-m1');
      expect(message).toContain('[Bot Inbox: Group digest]');
      expect(message.indexOf('Message ID: harvest-m1')).toBeLessThan(
        message.indexOf('[Bot Inbox: Group digest]'),
      );
      expect(admissionStates(core, 'ada')).toEqual(['handled', 'handled']);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('leaves every included admission needs-repair when the harvest fails after a side effect', async () => {
    const home = createTempRoot('botharness-harvest-failure-');
    let runs = 0;
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        runs += 1;
        await run.channels.send({ body: 'partial progress' });
        throw new Error('harvest boom');
      },
      async runAssignment(_run: AssignmentAgentRun) {},
      requestAssignment(_run: AssignmentAgentRun): AssignmentRequestDelivery {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      await admitMention(core, group.id, 'harvest-f1', '@Ada one');
      await admitMention(core, group.id, 'harvest-f2', '@Ada two');
      admit(core, group.id, 'harvest-f1');
      admit(core, group.id, 'harvest-f2');
      await core.runtime.whenIdle();

      expect(runs).toBe(1);
      expect(admissionStates(core, 'ada')).toEqual(['needs-repair', 'needs-repair']);
      expect(
        core.channels.readMessages(group.id).some((item) => item.body === 'partial progress'),
      ).toBe(true);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
