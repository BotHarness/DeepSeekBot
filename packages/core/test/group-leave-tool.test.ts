import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it, vi } from 'vitest';

import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

type Fixture = {
  core: ReturnType<typeof createCore>;
  tools: readonly ToolDefinition[];
  groupId: string;
  hiddenId: string;
  dmId: string;
};
async function call(f: Fixture, name: string, args: unknown) {
  return f.tools
    .find((tool) => tool.name === name)!
    .execute(args, { signal: new AbortController().signal } as ToolRunContext);
}
async function leave(f: Fixture, channelId = f.groupId) {
  return JSON.parse(String(await call(f, 'group_leave', { channel_id: channelId })));
}
async function fixture(check: (f: Fixture) => Promise<void>) {
  const failures: unknown[] = [];
  let checked = false;
  let groupId = '';
  let hiddenId = '';
  let dmId = '';
  const host = new FakeAgentHost(
    { kind: 'completed' },
    {
      onTurn: async (session, tools) => {
        if (session.header.cwd !== '/memory/ada' || checked) return;
        checked = true;
        try {
          await check({ core, tools, groupId, hiddenId, dmId });
        } catch (error) {
          failures.push(error);
          throw error;
        }
      },
    },
  );
  const core = createCore({
    dshHome: createTempRoot('botharness-group-leave-tool-'),
    agents: createDshBotAgentAdapter({
      agents: host,
      orchestratorCwd: (bot) => `/memory/${bot.slug}`,
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
  });
  try {
    for (const slug of ['ada', 'bea']) core.registry.create({ slug, displayName: slug });
    groupId = core.channels.createGroup({
      name: 'Creator Group',
      members: ['ada', 'bea'],
      ownerBotSlug: 'ada',
    }).id;
    hiddenId = core.channels.createGroup({ name: 'Hidden private name', members: ['bea'] }).id;
    core.channels.setGroupWakePolicy(groupId, 'ada', {
      mode: 'silent',
      count: 5,
      intervalSeconds: 30,
    });
    core.channels.setGroupWakePolicy(groupId, 'bea', {
      mode: 'all',
      count: 1,
      intervalSeconds: 1,
    });
    await core.channels.appendMessage(groupId, {
      id: 'pending',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Pending Group work',
    });
    core.runtime.admitGroupMessage(groupId, 'pending');
    await core.runtime.whenIdle();
    dmId = core.channels.getOrCreateDm('ada', 'ada')!.id;
    await core.channels.appendMessage(dmId, {
      id: 'trigger',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Leave check',
    });
    core.runtime.admitDmMessage({ channelId: dmId, messageId: 'trigger', body: 'Leave check' });
    await core.runtime.whenIdle();
    expect(checked).toBe(true);
    expect(failures).toEqual([]);
    const notice = core.channels.readMessages(groupId).find((message) => message.memberDeparture);
    if (notice !== undefined)
      expect(core.channels.message(groupId, notice.id)?.deliveries).toEqual([
        { botSlug: 'bea', state: 'handled' },
      ]);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

describe('compiled Orchestrator group_leave outcomes', () => {
  it('reports one committed departure and an idempotent repeat without duplicate notices or admissions', async () => {
    await fixture(async (f) => {
      expect(await leave(f)).toEqual({ channelId: f.groupId, left: true, outcome: 'changed' });
      expect(await leave(f)).toEqual({
        channelId: f.groupId,
        left: false,
        outcome: 'unchanged',
        reason: 'not-member',
      });
      expect(f.core.channels.get(f.groupId)).toMatchObject({ members: ['bea'] });
      expect(f.core.channels.get(f.groupId)?.ownerBotSlug).toBeUndefined();
      await expect(call(f, 'channel_read', { channel_id: f.groupId })).rejects.toThrow(
        'not a member',
      );
      await expect(
        call(f, 'bot_send_message', { channel_id: f.groupId, body: 'Denied' }),
      ).rejects.toThrow(/not a member|authorized Channel is unavailable/);
      const notices = f.core.channels.readMessages(f.groupId).filter((m) => m.memberDeparture);
      expect(notices).toHaveLength(1);
      expect(notices[0]?.memberDeparture?.departureType).toBe('left');
      const db = attachOperationalModule(f.core.operationalDatabase, 'group-leave-test');
      const facts = db.read((connection) =>
        connection
          .prepare(`
        SELECT a.bot_slug, a.last_error, e.message_id FROM inbox_admissions a
        JOIN source_events e ON e.source_event_id = a.source_event_id
        WHERE e.channel_id = ? ORDER BY e.message_id, a.bot_slug
      `)
          .all(f.groupId),
      );
      expect(facts.filter((row) => row.message_id === notices[0]!.id)).toEqual([
        { bot_slug: 'bea', last_error: null, message_id: notices[0]!.id },
      ]);
      expect(
        facts.find((row) => row.message_id === 'pending' && row.bot_slug === 'ada'),
      ).toMatchObject({
        last_error: 'Group membership revoked',
      });
    });
  });

  it('reports current nonmembership without guessing historical membership or disclosing hidden Group data', async () => {
    await fixture(async (f) => {
      expect(await leave(f, f.hiddenId)).toEqual({
        channelId: f.hiddenId,
        left: false,
        outcome: 'unchanged',
        reason: 'not-member',
      });
      expect(f.core.channels.readMessages(f.hiddenId)).toEqual([]);
      expect(f.core.channels.get(f.hiddenId)?.members).toEqual(['bea']);
      expect(f.core.channels.get(f.groupId)?.members).toEqual(['ada', 'bea']);
    });
  });

  it('rejects missing and DM targets as actionable Tool errors without a successful departure', async () => {
    await fixture(async (f) => {
      await expect(leave(f, 'missing-group')).rejects.toThrow('group_leave: channel-unavailable');
      await expect(leave(f, f.dmId)).rejects.toThrow('group_leave: group-required');
      expect(f.core.channels.get(f.groupId)?.members).toEqual(['ada', 'bea']);
      expect(f.core.channels.readMessages(f.groupId).filter((m) => m.memberDeparture)).toEqual([]);
    });
  });

  it('keeps a pre-commit exception as failure without fabricating a departure', async () => {
    await fixture(async (f) => {
      vi.spyOn(f.core.channels, 'removeGroupMember').mockImplementationOnce(() => {
        throw new Error('group_leave: storage-unavailable');
      });
      await expect(leave(f)).rejects.toThrow('group_leave: storage-unavailable');
      expect(f.core.channels.get(f.groupId)?.members).toEqual(['ada', 'bea']);
      expect(f.core.channels.readMessages(f.groupId).filter((m) => m.memberDeparture)).toEqual([]);
    });
  });

  it('still reports a committed change when live publication fails and the remaining member is admitted', async () => {
    await fixture(async (f) => {
      vi.spyOn(f.core.live, 'publishCommitted').mockImplementationOnce(() => {
        throw new Error('transient live publication failure');
      });
      expect(await leave(f)).toEqual({ channelId: f.groupId, left: true, outcome: 'changed' });
      const notice = f.core.channels.readMessages(f.groupId).find((m) => m.memberDeparture)!;
      expect(f.core.channels.message(f.groupId, notice.id)?.deliveries).toMatchObject([
        { botSlug: 'bea' },
      ]);
    });
  });
});
