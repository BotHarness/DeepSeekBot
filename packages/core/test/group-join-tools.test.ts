import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it } from 'vitest';

import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

async function roundTrip(accept: boolean) {
  let core: ReturnType<typeof createCore>;
  let groupId = '';
  let otherId = '';
  let requestId = '';
  let decide = false;
  let noticed = 0;
  const results: Record<string, unknown> = {};
  const failures: unknown[] = [];
  const host = new FakeAgentHost(
    { kind: 'completed' },
    {
      onTurn: async (session, tools) => {
        const actor = core.ownership.resolve(session.id)?.botSlug;
        const call = async (name: string, args: unknown) => {
          const value = await tools
            .find((tool) => tool.name === name)!
            .execute(args, { signal: new AbortController().signal } as ToolRunContext);
          return name === 'bot_send_message' ? value : JSON.parse(String(value));
        };
        try {
          if (actor === 'ada' && requestId === '') {
            expect((await call('channel_list', { channel_id: groupId })).channels).toEqual([]);
            await expect(call('group_join_request', { channel_id: otherId })).rejects.toThrow(
              'selected #Group',
            );
            results.requested = await call('group_join_request', { channel_id: groupId });
            requestId = (results.requested as { requestId: string }).requestId;
            results.rerequested = await call('group_join_request', { channel_id: groupId });
            await expect(call('channel_read', { channel_id: groupId })).rejects.toThrow(
              'not a member',
            );
            await expect(
              call('bot_send_message', { channel_id: groupId, body: 'too early' }),
            ).rejects.toThrow(/not a member|authorized Channel is unavailable/);
            await expect(
              call('group_join_decide', { channel_id: groupId, request_id: requestId, accept }),
            ).rejects.toThrow('current Bot Group owner');
            return;
          }
          if (actor === 'bea') {
            if (!decide) {
              const page = await call('channel_list', { channel_id: groupId });
              results.pending = page.channels[0].pendingJoinRequests;
              return;
            }
            results.decided = await call('group_join_decide', {
              channel_id: groupId,
              request_id: requestId,
              accept,
            });
            results.repeated = await call('group_join_decide', {
              channel_id: groupId,
              request_id: requestId,
              accept,
            });
            await expect(
              call('group_join_decide', {
                channel_id: groupId,
                request_id: requestId,
                accept: !accept,
              }),
            ).rejects.toThrow('no longer pending');
            return;
          }
          if (actor !== 'ada') throw new Error(`Unexpected actor ${actor}`);
          noticed += 1;
          if (accept)
            await call('bot_send_message', {
              channel_id: groupId,
              body: 'Joined through selected Group Tool',
            });
          else {
            await expect(call('channel_read', { channel_id: groupId })).rejects.toThrow(
              'not a member',
            );
            await expect(
              call('bot_send_message', { channel_id: groupId, body: 'forbidden' }),
            ).rejects.toThrow(/not a member|authorized Channel is unavailable/);
          }
        } catch (error) {
          failures.push(error);
          throw error;
        }
      },
    },
  );
  core = createCore({
    dshHome: createTempRoot('botharness-join-tools-'),
    agents: createDshBotAgentAdapter({
      agents: host,
      orchestratorCwd: (bot) => `/memory/${bot.slug}`,
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
  });
  try {
    for (const slug of ['ada', 'bea']) core.registry.create({ slug, displayName: slug });
    const group = core.channels.createGroup({
      name: 'Team',
      members: ['bea'],
      ownerBotSlug: 'bea',
    });
    groupId = group.id;
    otherId = core.channels.createGroup({
      name: 'Other',
      members: ['bea'],
      ownerBotSlug: 'bea',
    }).id;
    core.channels.setGroupAvatar(
      groupId,
      `data:image/png;base64,${Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=', 'base64'), Buffer.alloc(6000)]).toString('base64')}`,
    );
    core.channels.setGroupWakePolicy(
      groupId,
      'bea',
      { mode: 'silent', count: 5, intervalSeconds: 30 },
      { kind: 'human' },
    );
    const dm = core.channels.getOrCreateDm('ada', 'ada')!;
    const body = 'Join #Team';
    await core.channels.appendMessage(dm.id, {
      id: 'human-selected',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body,
      channelRefs: [{ channelId: groupId, label: 'Team', start: 5, end: 10 }],
    });
    core.runtime.admitDmMessage({ channelId: dm.id, messageId: 'human-selected', body });
    await core.runtime.whenIdle();
    expect(core.channels.get(groupId)?.members).toEqual(['bea']);
    expect(core.channels.get(groupId)?.joinRequests).toHaveLength(1);
    decide = true;
    const ownerDm = core.channels.getOrCreateDm('bea', 'bea')!;
    await core.channels.appendMessage(ownerDm.id, {
      id: 'human-decide',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Decide',
    });
    core.runtime.admitDmMessage({
      channelId: ownerDm.id,
      messageId: 'human-decide',
      body: 'Decide',
    });
    await core.runtime.whenIdle();
    expect(failures).toEqual([]);
    const stored = core.channels.get(groupId)!;
    const admissions = attachOperationalModule(core.operationalDatabase, 'join-tool-test').read(
      (db) =>
        db
          .prepare(
            "SELECT attempt_state FROM inbox_admissions WHERE bot_slug = 'ada' AND reason = 'group-join-decision'",
          )
          .all(),
    );
    return {
      results,
      requestId,
      group: stored,
      noticed,
      admissions,
      messages: core.channels.readMessages(groupId),
    };
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

describe('registered selected-Group join Tools through the owning runtime', () => {
  it.each([true, false])(
    'returns compact references for accepted=%s without changing authority',
    async (accept) => {
      const run = await roundTrip(accept);
      expect(run.results.requested).toEqual({
        channelId: run.group.id,
        requestId: run.requestId,
        requesterBotId: 'ada',
        outcome: 'pending',
      });
      expect(run.results.rerequested).toEqual(run.results.requested);
      expect(run.results.pending).toEqual([
        {
          requestId: run.requestId,
          requesterBotId: 'ada',
          createdAt: run.group.joinRequests![0]!.createdAt,
        },
      ]);
      expect(run.results.decided).toEqual({
        channelId: run.group.id,
        requestId: run.requestId,
        requesterBotId: 'ada',
        outcome: accept ? 'accepted' : 'declined',
        name: 'Team',
      });
      expect(run.results.repeated).toEqual(run.results.decided);
      expect(JSON.stringify(run.group).length).toBeGreaterThan(8000);
      for (const key of ['requested', 'rerequested', 'decided', 'repeated'])
        expect(JSON.stringify(run.results[key]).length).toBeLessThan(300);
      expect(run.group.members).toEqual(accept ? ['bea', 'ada'] : ['bea']);
      expect(run.noticed).toBe(1);
      expect(run.admissions).toEqual([{ attempt_state: 'handled' }]);
      expect(
        run.messages.some((message) => message.body === 'Joined through selected Group Tool'),
      ).toBe(accept);
    },
  );

  it.each(['archived', 'stale', 'departed-owner', 'wrong-owner', 'cancelled'] as const)(
    'rejects a %s decision without a success acknowledgement',
    async (scenario) => {
      let core: ReturnType<typeof createCore>;
      let groupId = '';
      let requestId = '';
      let result: unknown;
      const host = new FakeAgentHost(
        { kind: 'completed' },
        {
          onTurn: async (_session, tools) => {
            if (scenario === 'archived') core.registry.setPaused('ada', true);
            result = await tools
              .find((tool) => tool.name === 'group_join_decide')!
              .execute({ channel_id: groupId, request_id: requestId, accept: true }, {
                signal: new AbortController().signal,
              } as ToolRunContext)
              .then(
                (value) => value,
                (error: unknown) => error,
              );
          },
        },
      );
      core = createCore({
        dshHome: createTempRoot('botharness-join-identity-'),
        agents: createDshBotAgentAdapter({
          agents: host,
          orchestratorCwd: (bot) => `/memory/${bot.slug}`,
          ensureWorkspace: () => undefined,
          defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        }),
      });
      try {
        for (const slug of ['ada', 'bea', 'cee']) core.registry.create({ slug, displayName: slug });
        const group = core.channels.createGroup({
          name: 'Identity',
          members: ['bea', 'cee'],
          ownerBotSlug: scenario === 'wrong-owner' ? 'cee' : 'bea',
        });
        groupId = group.id;
        requestId = core.channels.requestGroupJoin({
          channelId: groupId,
          requesterBotSlug: 'ada',
          requesterBotCreatedAt:
            scenario === 'stale' ? '2000-01-01T00:00:00.000Z' : core.registry.get('ada')!.createdAt,
        }).id;
        if (scenario === 'departed-owner') core.channels.removeGroupMember(groupId, 'bea');
        if (scenario === 'cancelled') core.channels.cancelInvitationsForBot('ada');
        const dm = core.channels.getOrCreateDm('bea', 'bea')!;
        await core.channels.appendMessage(dm.id, {
          id: 'human-decide',
          at: new Date().toISOString(),
          author: { kind: 'human' },
          body: 'Decide',
        });
        core.runtime.admitDmMessage({
          channelId: dm.id,
          messageId: 'human-decide',
          body: 'Decide',
        });
        await core.runtime.whenIdle();
        expect(result).toBeInstanceOf(Error);
        expect(result).toHaveProperty(
          'message',
          scenario === 'cancelled'
            ? 'Group join request is no longer pending'
            : 'Only the current Bot Group owner can decide this join request',
        );
        expect(core.channels.get(groupId)?.members).not.toContain('ada');
      } finally {
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );
});
