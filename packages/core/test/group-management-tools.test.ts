import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it, vi } from 'vitest';

import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

async function managementRun(
  actor: 'ada' | 'bea',
  setup: (core: ReturnType<typeof createCore>, groupId: string) => void = () => undefined,
) {
  const results: Array<Promise<{ value?: unknown; error?: unknown }>> = [];
  const host = new FakeAgentHost(
    { kind: 'completed' },
    {
      onAgentCreated: () => {
        const scope = [...host.scopes.values()][0]!;
        scope.tools = scope.tools.filter((tool) => tool.name !== 'create_assignment');
        for (const [name, args] of [
          ['group_rename', { channel_id: group.id, name: '  Committed name  ' }],
          ['group_remove_member', { channel_id: group.id, bot_id: 'bea' }],
        ] as const) {
          const tool = scope.tools.find((entry) => entry.name === name)!;
          results.push(
            tool.execute(args, {} as ToolRunContext).then(
              (value) => ({ value }),
              (error: unknown) => ({ error }),
            ),
          );
        }
      },
    },
  );
  const core = createCore({
    dshHome: createTempRoot('botharness-management-tools-'),
    agents: createDshBotAgentAdapter({
      agents: host,
      orchestratorCwd: (bot) => `/memory/${bot.slug}`,
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
  });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.registry.create({ slug: 'bea', displayName: 'Bea' });
  const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
    name: 'Original name',
    members: ['ada', 'bea'],
    ownerBotSlug: 'ada',
  });
  core.channels.setGroupAvatar(
    OWNER_HUMAN_CONTEXT,
    group.id,
    `data:image/png;base64,${Buffer.concat([
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=',
        'base64',
      ),
      Buffer.alloc(6_000),
    ]).toString('base64')}`,
  );
  core.channels.setGroupWakePolicy(
    group.id,
    'bea',
    { mode: 'silent', count: 5, intervalSeconds: 30 },
    { kind: 'human' },
  );
  core.channels.setGroupWakePolicy(
    group.id,
    'ada',
    { mode: 'mentions', count: 5, intervalSeconds: 30 },
    { kind: 'human' },
  );
  setup(core, group.id);
  const before = core.channels.get(group.id)!;
  const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, actor, actor)!;
  try {
    await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
      id: 'human-manage',
      at: '2026-09-30T00:00:00.000Z',
      author: { kind: 'human' },
      body: 'Manage Group',
    });
    core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
      channelId: dm.id,
      messageId: 'human-manage',
      body: 'Manage Group',
    });
    await core.runtime.whenIdle();
    return {
      groupId: group.id,
      before,
      after: core.channels.get(group.id)!,
      results: await Promise.all(results),
      departures: core.channels.readMessages(group.id).filter((entry) => entry.memberDeparture),
    };
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
    vi.restoreAllMocks();
  }
}

describe('registered Group management Tools through the owning runtime', () => {
  it('acknowledges the persisted name and removed Bot without serializing presentation state', async () => {
    const run = await managementRun('ada');
    expect(run.results).toEqual([
      {
        value: JSON.stringify({
          channelId: run.groupId,
          name: 'Committed name',
          outcome: 'renamed',
        }),
      },
      {
        value: JSON.stringify({
          channelId: run.groupId,
          name: 'Committed name',
          outcome: 'member-removed',
          memberBotId: 'bea',
        }),
      },
    ]);
    expect(JSON.stringify(run.before).length).toBeGreaterThan(8_000);
    expect(run.results.every((result) => String(result.value).length < 250)).toBe(true);
    expect(run.after).toMatchObject({
      name: 'Committed name',
      members: ['ada'],
      avatar: run.before.avatar,
      wakePolicies: { ada: run.before.wakePolicies?.ada },
    });
    expect(run.departures).toMatchObject([
      { memberDeparture: { memberId: 'bea', departureType: 'removed' } },
    ]);
  });

  it('rejects a current member who is not the creator', async () => {
    const run = await managementRun('bea');
    expect(run.results).toEqual([
      { error: expect.objectContaining({ message: 'Only the Bot Group owner may rename' }) },
      {
        error: expect.objectContaining({
          message: 'Only the Bot Group owner may remove another member',
        }),
      },
    ]);
    expect(run.after).toEqual(run.before);
    expect(run.departures).toEqual([]);
  });

  it('rejects a creator whose membership has ended before this turn', async () => {
    const run = await managementRun('ada', (core, groupId) => {
      core.channels.removeGroupMember(groupId, 'ada', 'left');
    });
    expect(run.results).toEqual([
      { error: expect.objectContaining({ message: 'Only the Bot Group owner may rename' }) },
      {
        error: expect.objectContaining({
          message: 'Only the Bot Group owner may remove another member',
        }),
      },
    ]);
    expect(run.after).toEqual(run.before);
    expect(run.departures).toHaveLength(1);
    expect(run.departures[0]?.memberDeparture).toEqual({
      memberKind: 'bot',
      memberId: 'ada',
      displayName: 'Ada',
      departureType: 'left',
    });
  });

  it('fails explicitly if a checked rename unexpectedly produces no record', async () => {
    const run = await managementRun('ada', (core) => {
      vi.spyOn(core.channels, 'rename').mockReturnValue(undefined);
    });
    expect(run.results[0]).toEqual({
      error: expect.objectContaining({ message: 'Group rename did not return a Channel' }),
    });
    expect(run.after.name).toBe('Original name');
    expect(JSON.parse(String(run.results[1]?.value))).toMatchObject({
      name: 'Original name',
      outcome: 'member-removed',
    });
  });
});
