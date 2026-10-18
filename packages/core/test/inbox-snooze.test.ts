import { describe, expect, it, vi } from 'vitest';
import { inboxFixture as fixture } from './inbox-fixture.js';
import { createCore } from '../src/plugin.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function inFuture(milliseconds: number): string {
  return new Date(Date.now() + milliseconds).toISOString();
}

describe('Orchestrator inbox snooze', () => {
  it('returns at its deadline when later Group context did not wake the Bot', async () => {
    const runs: OrchestratorAgentRun[] = [];
    const core = createCore({
      dshHome: createTempRoot('inbox-snooze-group-'),
      triageContinuation: false,
      agents: {
        async runOrchestrator(run) {
          runs.push(run);
          if (runs.length === 1)
            run.triage!.snooze({
              ids: ['request'],
              until: inFuture(1500),
              note: 'Read latest material',
            });
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('Unexpected Assignment');
        },
        async close() {},
      },
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Deferred notice', members: ['ada'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'mentions',
        count: 5,
        intervalSeconds: 30,
      });
      await core.channels.appendMessage(group.id, {
        id: 'request',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Ada send after material confirmation',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      core.runtime.admitGroupMessage(group.id, 'request');
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      await core.channels.appendMessage(group.id, {
        id: 'condition',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Material is R4; send at the agreed time.',
      });
      core.runtime.admitGroupMessage(group.id, 'condition');
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      expect(
        core.attention
          .list({ botSlug: 'ada' })
          .items.find((item) => item.sourceMessageId === 'request')?.state,
      ).toBe('snoozed');
      await vi.waitFor(() => expect(runs).toHaveLength(2), { timeout: 4000 });
      expect(runs[1]!.message).toContain('[Snooze returned]');
      expect(runs[1]!.message).toContain('Read latest material');
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('hides a snoozed item, then brings it back with a wake when it is due', async () => {
    const f = await fixture();
    try {
      const item = await f.send('Ping me about the release after lunch');
      await f.send('Snooze that release ping', (run) => {
        const snoozed = run.triage!.snooze({
          ids: [item],
          until: inFuture(1500),
          note: 'After lunch',
        });
        return { snoozed, list: run.triage!.list() };
      });
      const { snoozed, list } = f.results[0] as Record<string, unknown>;
      expect(snoozed).toMatchObject({ outcome: 'snoozed', snoozed: [item] });
      expect(list).toMatchObject({ snoozed: 1 });
      expect(JSON.stringify(list)).not.toContain(item);
      expect(f.state(item)).toBe('snoozed');
      const row = f.core.attention
        .list({ botSlug: 'ada', limit: 100 })
        .items.find((entry) => entry.id === item);
      expect(row).toMatchObject({ snoozeNote: 'After lunch' });
      expect(row?.snoozedUntil).toEqual(expect.any(String));

      const turns = f.runs.length;
      await vi.waitFor(() => expect(f.runs.length).toBe(turns + 1), { timeout: 10000 });
      await f.core.runtime.whenIdle();
      const wake = f.runs.at(-1)!;
      expect(wake.message).toContain('[Snooze returned]');
      expect(wake.message).toContain(item);
      expect(wake.message).toContain('After lunch');
      expect(wake.inbox).toContain('[Open Inbox] 2 items');
      expect(f.state(item)).toBe('open');
    } finally {
      await f.close();
    }
  }, 60000);

  it('returns early when a new event arrives in the same conversation', async () => {
    const f = await fixture();
    try {
      const item = await f.send('Waiting on the vendor quote');
      await f.send('Snooze the vendor quote', (run) =>
        run.triage!.snooze({ ids: [item], until: inFuture(1500) }),
      );
      expect(f.state(item)).toBe('snoozed');
      await f.send('The vendor just replied with a quote');
      expect(f.state(item)).toBe('open');
      expect(f.runs.at(-1)!.inbox).toContain('[Open Inbox] 2 items');
      const turns = f.runs.length;
      await new Promise((resolve) => setTimeout(resolve, 1800));
      await f.core.runtime.whenIdle();
      expect(f.runs).toHaveLength(turns);
    } finally {
      await f.close();
    }
  }, 60000);

  it('never moves a snooze earlier and confirms a filter before snoozing', async () => {
    const f = await fixture();
    try {
      const item = await f.send('Quarterly report draft');
      const later = inFuture(7_200_000);
      const sooner = inFuture(60_000);
      await f.send('Snooze it twice', (run) => {
        const first = run.triage!.snooze({ ids: [item], until: later });
        const second = run.triage!.snooze({ ids: [item], until: sooner });
        return { first, second };
      });
      const { second } = f.results[0] as { second: { snoozedUntil: string } };
      expect(second.snoozedUntil).toBe(later);

      await f.send('Snooze everything in this DM', (run) => {
        const preview = run.triage!.snooze({ filter: { channelId: f.dm.id }, until: later });
        if (preview.outcome !== 'confirm') throw new Error('Expected a confirmation');
        return run.triage!.snooze({
          filter: { channelId: f.dm.id },
          until: later,
          confirm: preview.token,
        });
      });
      expect(f.results[1]).toMatchObject({ outcome: 'snoozed' });
    } finally {
      await f.close();
    }
  }, 60000);

  it('refuses a snooze in the past', async () => {
    const f = await fixture();
    try {
      const item = await f.send('Old item');
      await f.send('Bad snooze', (run) => {
        expect(() =>
          run.triage!.snooze({ ids: [item], until: new Date(Date.now() - 1000).toISOString() }),
        ).toThrow(/future/);
      });
      expect(f.results).toHaveLength(1);
    } finally {
      await f.close();
    }
  }, 60000);
});
