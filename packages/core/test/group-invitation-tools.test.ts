import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it, vi } from 'vitest';

import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

async function roundTrip(accept: boolean, resolveOnInvite = false) {
  const results: Record<string, unknown> = {};
  const failures: unknown[] = [];
  let core: ReturnType<typeof createCore>;
  let groupId = '';
  let inviteId = '';
  const host = new FakeAgentHost(
    { kind: 'completed' },
    {
      onTurn: async (session, tools) => {
        const actor = core.ownership.resolve(session.id)?.botSlug;
        const call = async (name: string, args: unknown) => {
          const tool = tools.find((entry) => entry.name === name)!;
          const result = await tool.execute(args, {
            signal: new AbortController().signal,
          } as ToolRunContext);
          return name === 'bot_send_message'
            ? { sent: String(result) }
            : (JSON.parse(String(result)) as Record<string, unknown>);
        };
        try {
          if (actor === 'ada') {
            const created = await call('group_create', { name: '  Team  ' });
            groupId = String(created.channelId);
            results.created = created;
            core.channels.setGroupAvatar(
              groupId,
              `data:image/png;base64,${Buffer.concat([
                Buffer.from(
                  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=',
                  'base64',
                ),
                Buffer.alloc(6_000),
              ]).toString('base64')}`,
            );
            core.channels.setGroupWakePolicy(
              groupId,
              'ada',
              { mode: 'silent', count: 5, intervalSeconds: 30 },
              { kind: 'human' },
            );
            const history = core.channels.inviteGroupBot({
              channelId: groupId,
              inviterBotSlug: 'ada',
              targetBotSlug: 'hist',
              targetBotCreatedAt: core.registry.get('hist')!.createdAt,
              targetDmChannelId: core.channels.getOrCreateDm('hist', 'History')!.id,
            });
            core.channels.respondToGroupInvite({
              invitationId: history.id,
              targetBotSlug: 'hist',
              targetBotCreatedAt: core.registry.get('hist')!.createdAt,
              accept: false,
            });
            if (resolveOnInvite) {
              const invite = core.channels.inviteGroupBot;
              vi.spyOn(core.channels, 'inviteGroupBot').mockImplementation((input) => {
                const invitation = invite(input);
                return core.channels.respondToGroupInvite({
                  invitationId: invitation.id,
                  targetBotSlug: input.targetBotSlug,
                  targetBotCreatedAt: input.targetBotCreatedAt,
                  accept: true,
                }).invitation;
              });
            }
            const invitation = await call('group_invite_bot', {
              channel_id: groupId,
              bot_id: 'bea',
            });
            inviteId = String(invitation.inviteId);
            results.invited = invitation;
            if (!resolveOnInvite) {
              results.reinvited = await call('group_invite_bot', {
                channel_id: groupId,
                bot_id: 'bea',
              });
            }
            return;
          }
          if (actor !== 'bea') throw new Error(`Unexpected actor ${actor}`);
          if (!resolveOnInvite) {
            await expect(call('channel_read', { channel_id: groupId })).rejects.toThrow(
              'not a member',
            );
            await expect(
              call('bot_send_message', { channel_id: groupId, body: 'too early' }),
            ).rejects.toThrow(/not a member|authorized Channel is unavailable/);
          }
          results.decided = await call('group_invite_respond', { invite_id: inviteId, accept });
          results.repeated = await call('group_invite_respond', { invite_id: inviteId, accept });
          await expect(
            call('group_invite_respond', { invite_id: inviteId, accept: !accept }),
          ).rejects.toThrow('no longer pending');
          if (accept) {
            await call('bot_send_message', {
              channel_id: groupId,
              body: 'Joined through real Tool',
            });
          } else {
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
    autoAcceptGroupInvitations: () => false,
    dshHome: createTempRoot('botharness-invitation-tools-'),
    agents: createDshBotAgentAdapter({
      agents: host,
      orchestratorCwd: (bot) => `/memory/${bot.slug}`,
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
  });
  try {
    for (const slug of ['ada', 'bea', 'hist'])
      core.registry.create({ slug, displayName: slug.toUpperCase() });
    const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
    await core.channels.appendMessage(dm.id, {
      id: 'human-create',
      at: '2026-09-30T00:00:00.000Z',
      author: { kind: 'human' },
      body: 'Create and invite',
    });
    core.runtime.admitDmMessage({ channelId: dm.id, messageId: 'human-create', body: 'Create' });
    await core.runtime.whenIdle();
    expect(failures).toEqual([]);
    const group = core.channels.get(groupId)!;
    const admissions = attachOperationalModule(
      core.operationalDatabase,
      'invitation-tool-test',
    ).read((db) =>
      db
        .prepare(
          "SELECT attempt_state FROM inbox_admissions WHERE bot_slug = 'bea' AND reason = 'group-invite'",
        )
        .all(),
    );
    return { group, results, inviteId, admissions, messages: core.channels.readMessages(groupId) };
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
    vi.restoreAllMocks();
  }
}

describe('registered Group invitation Tools through the owning runtime', () => {
  it.each([true, false])(
    'returns compact references for an accepted=%s round trip',
    async (accept) => {
      const run = await roundTrip(accept);
      expect(run.results.created).toEqual({
        channelId: run.group.id,
        name: 'Team',
        outcome: 'created',
      });
      expect(run.results.invited).toEqual({
        channelId: run.group.id,
        inviteId: run.inviteId,
        inviteeBotId: 'bea',
        outcome: 'pending',
      });
      expect(run.results.reinvited).toEqual(run.results.invited);
      expect(run.results.decided).toEqual({
        channelId: run.group.id,
        inviteId: run.inviteId,
        inviteeBotId: 'bea',
        outcome: accept ? 'accepted' : 'declined',
        name: 'Team',
      });
      expect(run.results.repeated).toEqual(run.results.decided);
      expect(JSON.stringify(run.group).length).toBeGreaterThan(8_000);
      expect(
        Object.values(run.results).every((result) => JSON.stringify(result).length < 300),
      ).toBe(true);
      expect(run.group.members).toEqual(accept ? ['ada', 'bea'] : ['ada']);
      expect(run.group.invitations?.map((entry) => entry.status)).toEqual([
        'declined',
        accept ? 'accepted' : 'declined',
      ]);
      expect(run.admissions).toEqual([{ attempt_state: 'handled' }]);
      expect(run.messages.some((message) => message.body === 'Joined through real Tool')).toBe(
        accept,
      );
    },
  );

  it('reports the returned accepted status if the owner command resolves an invitation immediately', async () => {
    const run = await roundTrip(true, true);
    expect(run.results.invited).toEqual({
      channelId: run.group.id,
      inviteId: run.inviteId,
      inviteeBotId: 'bea',
      outcome: 'accepted',
    });
    expect(run.group.members).toEqual(['ada', 'bea']);
  });
});

it.each(['archived', 'stale', 'cancelled', 'wrong-invitee'] as const)(
  'rejects an invitation response from a %s identity or decision',
  async (scenario) => {
    let core: ReturnType<typeof createCore>;
    let response: unknown;
    let inviteId = '';
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onTurn: async (_session, tools) => {
          if (scenario === 'archived') core.registry.setPaused('bea', true);
          const tool = tools.find((entry) => entry.name === 'group_invite_respond')!;
          response = await tool
            .execute({ invite_id: inviteId, accept: true }, {
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
      autoAcceptGroupInvitations: () => false,
      dshHome: createTempRoot('botharness-invitation-identity-'),
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
        members: ['ada'],
        ownerBotSlug: 'ada',
      });
      const target = core.registry.get(scenario === 'wrong-invitee' ? 'cee' : 'bea')!;
      inviteId = core.channels.inviteGroupBot({
        channelId: group.id,
        inviterBotSlug: 'ada',
        targetBotSlug: target.slug,
        targetBotCreatedAt: scenario === 'stale' ? '2000-01-01T00:00:00.000Z' : target.createdAt,
        targetDmChannelId: core.channels.getOrCreateDm(target.slug, target.displayName)!.id,
      }).id;
      if (scenario === 'cancelled') core.channels.cancelGroupInvite(group.id, inviteId);
      const dm = core.channels.getOrCreateDm('bea', 'bea')!;
      await core.channels.appendMessage(dm.id, {
        id: 'human-respond',
        at: '2026-09-30T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Respond',
      });
      core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'human-respond',
        body: 'Respond',
      });
      await core.runtime.whenIdle();
      expect(response).toBeInstanceOf(Error);
      expect(response).toHaveProperty(
        'message',
        scenario === 'archived'
          ? 'Archived PersonaBot cannot answer a Group invitation'
          : scenario === 'cancelled'
            ? 'Group invitation is no longer pending'
            : 'Group invitation is unavailable to this PersonaBot',
      );
      expect(core.channels.get(group.id)?.members).toEqual(['ada']);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  },
);
