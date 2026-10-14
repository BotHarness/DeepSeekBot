import { describe, expect, it, vi } from 'vitest';

import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

async function secondReport(delivery: 'steered' | 'read') {
  let held!: (run: OrchestratorAgentRun) => void;
  let release!: () => void;
  const heldRun = new Promise<OrchestratorAgentRun>((resolve) => {
    held = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const steered: string[] = [];
  const runs: string[] = [];
  let groupId = '';
  const core = createCore({
    dshHome: createTempRoot('bh-steered-causation-'),
    agents: {
      async runOrchestrator(run) {
        runs.push(run.bot.slug);
        const turn = runs.filter((slug) => slug === run.bot.slug).length;
        if (run.bot.slug === 'nexus' && turn === 1)
          await run.channels.send({ channelId: groupId, body: '@美工 Aura 收到，辛苦' });
        if (run.bot.slug === 'aura' && turn === 1) {
          await run.channels.send({ channelId: groupId, body: '@总控 Nexus 第一份配色已完成' });
          held(run);
          await released;
        }
      },
      steerOrchestrator(slug, text) {
        if (slug !== 'aura' || delivery !== 'steered') return false;
        steered.push(text);
        return true;
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    },
  });
  try {
    core.registry.create({ slug: 'nexus', displayName: '总控 Nexus' });
    core.registry.create({ slug: 'aura', displayName: '美工 Aura' });
    const group = core.channels.createGroup({ name: 'Studio', members: ['nexus', 'aura'] });
    groupId = group.id;
    await core.channels.appendMessage(group.id, {
      id: 'task-1',
      at: '2026-10-14T00:00:00.000Z',
      author: { kind: 'human' },
      body: '@美工 Aura 给一个像素风配色，完成后 @总控 Nexus',
      mentions: [{ botSlug: 'aura', label: '美工 Aura', start: 0, end: 8 }],
    });
    core.runtime.admitGroupMessage(group.id, 'task-1');
    const run = await heldRun;
    await vi.waitFor(() =>
      expect(
        core.channels
          .readMessages(group.id)
          .some((message) => message.author.kind === 'bot' && message.author.slug === 'nexus'),
      ).toBe(true),
    );

    await core.channels.appendMessage(group.id, {
      id: 'task-2',
      at: '2026-10-14T00:01:00.000Z',
      author: { kind: 'human' },
      body: '@美工 Aura 再给一个赛博朋克配色，完成后 @总控 Nexus',
      mentions: [{ botSlug: 'aura', label: '美工 Aura', start: 0, end: 8 }],
    });
    core.runtime.admitGroupMessage(group.id, 'task-2');
    if (delivery === 'steered') expect(steered).toHaveLength(2);
    else run.channels.read({ channelId: group.id });
    const second = await run.channels.send({
      channelId: group.id,
      body: '@总控 Nexus 第二份配色已完成',
    });
    release();
    await core.runtime.whenIdle();

    return attachOperationalModule(core.operationalDatabase, 'steered-causation').read(
      (db) =>
        db
          .prepare(
            `SELECT a.reason
               FROM inbox_admissions a JOIN source_events e ON e.source_event_id = a.source_event_id
              WHERE e.message_id = ? AND a.bot_slug = 'nexus'`,
          )
          .get(second.id) as { reason: string } | undefined,
    );
  } finally {
    release();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

describe('a Group report on a new Human task that reaches a busy turn', () => {
  it('wakes the coordinator again when the task was steered into the turn', async () => {
    expect((await secondReport('steered'))?.reason).toBe('group-mention');
  });

  it('wakes the coordinator again when the Bot read the task with channel_read', async () => {
    expect((await secondReport('read'))?.reason).toBe('group-mention');
  });
});
