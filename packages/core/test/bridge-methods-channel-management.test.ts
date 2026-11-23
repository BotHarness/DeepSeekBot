import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ChannelStore } from '../src/channels/store.js';
import { type BotRuntime } from '../src/runtime/bot-runtime.js';
import type { WorkspaceGrantStore } from '../src/workspaces/grants.js';
import { createTestOwnership } from './helpers.js';
import { roots, modelOwners, setup } from './support/bridge-methods.js';

it('reports unavailable Group review without blaming roster storage', () => {
  const { registry, channels, methods } = setup();
  registry.create({ slug: 'ada', displayName: 'Ada' });
  const channel = channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Review', members: ['ada'] });
  vi.spyOn(channels, 'listHumanMembers').mockReturnValue([
    { humanId: 'local-human', displayName: 'Human' },
  ]);
  expect(methods.channelGroupSendReview({ channelId: channel.id })).toEqual({
    ok: false,
    error: {
      code: 'unavailable',
      message: 'Group send review is unavailable on this Host',
    },
  });
});

afterEach(() => {
  for (const owner of modelOwners.splice(0)) owner.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bridge methods', () => {
  it('scopes Group authorization to a current member and the confirmed path', async () => {
    const grant = {
      id: 'grant',
      botSlug: 'ada',
      workspaceId: 'project',
      workspacePath: '/project',
      workspaceTitle: 'Project',
      createdAt: '',
    };
    const create = vi.fn<WorkspaceGrantStore['create']>(async (_slug, _workspace, options) => {
      options?.validate();
      options?.onCreated();
      return grant;
    });
    const grants: WorkspaceGrantStore = {
      list: () => [],
      create,
      revoke: () => grant,
      requireActive: () => grant,
      setOrchestratorWrite: () => grant,
      availableWorkspaces: () => [{ id: 'project', path: '/project', title: 'Project' }],
    };
    const { registry, channels, methods } = setup(
      [],
      ['ada', 'bea'],
      undefined,
      createTestOwnership(),
      grants,
    );
    registry.create({ slug: 'ada', displayName: 'Ada' });
    registry.create({ slug: 'bea', displayName: 'Bea' });
    const group = channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Team', members: ['ada'] });
    const input = {
      slug: 'ada',
      workspaceId: 'project',
      scope: { channelId: group.id, path: '/project' },
    };
    expect(await methods.grantCreate({ ...input, slug: 'bea' })).toMatchObject({
      ok: false,
    });
    expect(
      await methods.grantCreate({
        ...input,
        scope: { ...input.scope, path: '/other' },
      }),
    ).toMatchObject({ ok: false });
    expect(create).not.toHaveBeenCalled();
    expect(await methods.grantCreate(input)).toMatchObject({
      ok: true,
      value: { grant, created: true },
    });
    expect(create).toHaveBeenCalledTimes(1);
    registry.setPaused('ada', true);
    expect(await methods.grantCreate(input)).toMatchObject({ ok: false });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not expand pasted text, DM selections, empty previews or forged recipient lists', async () => {
    const { registry, channels, methods } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    registry.create({ slug: 'outsider', displayName: 'Outsider' });
    const group = channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Bounded', members: ['ada'] });
    const preview = methods.channelAllBotPreview({ channelId: group.id });
    if (!preview.ok) throw new Error('Expected preview');
    const selection = {
      start: 0,
      end: 9,
      label: 'All Bots',
      preview: preview.value,
    };
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    expect(
      await methods.channelSend({
        channelId: dm.id,
        body: '@All Bots check',
        allBotMention: selection,
      }),
    ).toMatchObject({ ok: false });
    expect(
      await methods.channelSend({
        channelId: group.id,
        body: '@All Bots check',
        allBotMention: {
          ...selection,
          preview: {
            ...preview.value,
            recipients: [{ botSlug: 'outsider', label: 'Outsider' }],
          },
        },
      }),
    ).toMatchObject({ ok: false });
    registry.setPaused('ada', true);
    const empty = methods.channelAllBotPreview({ channelId: group.id });
    if (!empty.ok) throw new Error('Expected empty preview');
    expect(empty.value.recipients).toEqual([]);
    expect(
      await methods.channelSend({
        channelId: group.id,
        body: '@All Bots check',
        allBotMention: { ...selection, preview: empty.value },
      }),
    ).toMatchObject({ ok: false });
    expect(
      await methods.channelSend({
        channelId: group.id,
        body: '@All Bots plain text',
      }),
    ).toMatchObject({
      ok: true,
      value: { message: { body: '@All Bots plain text' } },
    });
    expect(channels.readMessages(group.id)).toHaveLength(1);
    expect(channels.readMessages(group.id)[0]?.mentions).toBeUndefined();
  });

  it('rejects All Bots when eligibility changes while the Channel commit is queued', async () => {
    const { registry, channels, methods } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const group = channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Queued preview',
      members: ['ada'],
    });
    const preview = methods.channelAllBotPreview({ channelId: group.id });
    if (!preview.ok) throw new Error('Expected preview');
    const sending = methods.channelSend({
      channelId: group.id,
      body: '@All Bots check',
      allBotMention: {
        start: 0,
        end: 9,
        label: 'All Bots',
        preview: preview.value,
      },
    });
    registry.setPaused('ada', true);
    expect(await sending).toMatchObject({
      ok: false,
      error: { code: 'all-bot-preview-changed' },
    });
    expect(channels.readMessages(group.id)).toEqual([]);
  });

  it('rejects a stale All Bots preview even when the new recipient count is unchanged', async () => {
    const { registry, channels, methods } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    registry.create({ slug: 'bea', displayName: 'Bea' });
    const group = channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Stale',
      members: ['ada', 'bea'],
    });
    registry.setPaused('bea', true);
    const preview = methods.channelAllBotPreview({ channelId: group.id });
    if (!preview.ok) throw new Error('Expected preview');
    registry.setPaused('bea', false);
    registry.setPaused('ada', true);
    const result = await methods.channelSend({
      channelId: group.id,
      body: '@All Bots check',
      allBotMention: {
        start: 0,
        end: 9,
        label: 'All Bots',
        preview: preview.value,
      },
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'all-bot-preview-changed',
        details: {
          preview: { recipients: [{ botSlug: 'bea', label: 'Bea' }] },
        },
      },
    });
    expect(channels.readMessages(group.id)).toEqual([]);
    expect(methods.channelAllBotPreview({ channelId: group.id })).toMatchObject({
      ok: true,
      value: { recipients: [{ botSlug: 'bea', label: 'Bea' }] },
    });
  });

  it('Human selects all active joined Bots once and sends ordinary explicit mentions', async () => {
    const { registry, channels, methods } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    registry.create({ slug: 'bea', displayName: 'Bea' });
    registry.create({ slug: 'archived', displayName: 'Archived' });
    registry.setPaused('archived', true);
    registry.create({ slug: 'outsider', displayName: 'Outsider' });
    const group = channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'All Bots',
      members: ['bea', 'archived', 'ada'],
    });
    const preview = methods.channelAllBotPreview({ channelId: group.id });
    expect(preview).toMatchObject({
      ok: true,
      value: {
        recipients: [
          { botSlug: 'ada', label: 'Ada' },
          { botSlug: 'bea', label: 'Bea' },
        ],
      },
    });
    if (!preview.ok) throw new Error('Expected preview');
    const result = await methods.channelSend({
      channelId: group.id,
      body: '@所有 Bot 请核对',
      allBotMention: {
        start: 0,
        end: 7,
        label: '所有 Bot',
        preview: preview.value,
      },
      messageId: 'human-3c44062a-4083-4a74-aeaf-4ec98a4d29e1',
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        message: {
          body: '@Ada @Bea 请核对',
          mentions: [
            { botSlug: 'ada', label: 'Ada', start: 0, end: 4 },
            { botSlug: 'bea', label: 'Bea', start: 5, end: 9 },
          ],
        },
      },
    });
    expect(channels.readMessages(group.id)).toHaveLength(1);
  });

  it('keeps Bot-to-Bot DMs inspectable but rejects Human sends and renames', async () => {
    const { registry, channels, methods } = setup([], ['ada', 'bea']);
    registry.create({ slug: 'ada', displayName: 'Ada' });
    registry.create({ slug: 'bea', displayName: 'Bea' });
    const dm = channels.getOrCreateBotDm(OWNER_HUMAN_CONTEXT, 'ada', 'bea', 'Ada · Bea')!;
    expect(methods.channelMessages({ channelId: dm.id })).toMatchObject({
      ok: true,
    });
    expect(
      await methods.channelSend({
        channelId: dm.id,
        body: 'Human interjection',
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(methods.channelRename({ channelId: dm.id, name: 'Changed' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(channels.readMessages(dm.id)).toEqual([]);
  });

  it('requires selected joined Bot identities and preserves committed retry identity', async () => {
    const wakes: string[] = [];
    const { registry, channels, methods } = setup([], ['ada', 'bea'], () => ({
      admitGroupMessage(channelId, messageId) {
        wakes.push(channelId + ':' + messageId);
      },
      admitBotDmMessage() {},
      async withdrawNetworkMembership() {},
      admitGroupInvitation() {},
      admitDmMessage: () => ({
        admitted: true as const,
        settled: Promise.resolve(),
      }),
      listAssignments: () => [],
      getAssignment: () => undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    expect(registry.create({ slug: 'ada', displayName: 'Alex' }).ok).toBe(true);
    expect(registry.create({ slug: 'bea', displayName: 'Alex' }).ok).toBe(true);
    const group = channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Team',
      members: ['ada', 'bea'],
    });
    const body = '@Alex @Alex hello';
    const payload = {
      channelId: group.id,
      messageId: 'human-25f4609a-2aee-446a-a5d9-ea53607aba13',
      body,
      mentions: [
        { botSlug: 'ada', label: 'Alex', start: 0, end: 5 },
        { botSlug: 'bea', label: 'Alex', start: 6, end: 11 },
      ],
    };
    expect(await methods.channelSend(payload)).toMatchObject({ ok: true });
    expect(wakes).toHaveLength(1);
    expect(channels.readMessages(group.id)).toHaveLength(1);
    expect(await methods.channelSend(payload)).toMatchObject({ ok: true });
    expect(wakes).toHaveLength(1);
    registry.setPaused('bea', true);
    expect(await methods.channelSend(payload)).toMatchObject({ ok: true });
    expect(
      await methods.channelSend({
        channelId: group.id,
        body: '@Alex hello',
        mentions: [{ botSlug: 'bea', label: 'Alex', start: 0, end: 5 }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });

    expect(
      await methods.channelSend({
        channelId: group.id,
        body: '@Alex hello',
        mentions: [{ botSlug: 'outsider', label: 'Alex', start: 0, end: 5 }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await methods.channelSend({
        channelId: group.id,
        body: '@Alex hello',
        mentions: [{ botSlug: 'ada', label: 'wrong', start: 0, end: 5 }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(await methods.channelSend({ channelId: group.id, body: '@Alex hello' })).toMatchObject({
      ok: true,
    });
    expect(wakes).toHaveLength(2);
    expect(channels.readMessages(group.id)).toHaveLength(2);
  });

  it('lists, opens, and creates local channels with a latest-message projection', async () => {
    const { methods, registry } = setup();
    methods.create({ slug: 'ada', displayName: 'Ada' });

    expect(await methods.channels({})).toEqual({
      ok: true,
      value: {
        channels: [
          expect.objectContaining({
            id: 'dm-ada',
            type: 'dm',
            name: 'Ada',
            members: ['ada'],
            botSlug: 'ada',
          }),
        ],
      },
    });

    const dm = methods.channelDm({ slug: 'ada', displayName: 'Ada' });
    expect(dm.ok && dm.value.channel).toMatchObject({
      id: 'dm-ada',
      type: 'dm',
      name: 'Ada',
      members: ['ada'],
      botSlug: 'ada',
    });
    const again = methods.channelDm({ slug: 'ada' });
    expect(again.ok && again.value.channel.id).toBe('dm-ada');
    expect(again.ok && again.value.channel.name).toBe('Ada');

    await methods.channelSend({ channelId: 'dm-ada', body: '最新进展' });
    const dmList = await methods.channels({});
    expect(dmList.ok && dmList.value.channels[0]?.latestMessage?.body).toBe('最新进展');

    const group = methods.channelCreate({
      name: 'Design Team',
      members: ['ada', 'bob'],
    });
    expect(group.ok && group.value.channel).toMatchObject({
      id: 'group-design-team',
      type: 'group',
      name: 'Design Team',
      members: ['ada'],
    });
    const renamedGroup = methods.channelRename({
      channelId: 'group-design-team',
      name: '  Product Team  ',
    });
    expect(renamedGroup.ok && renamedGroup.value.channel.name).toBe('Product Team');
    expect(renamedGroup.ok && renamedGroup.value.bot).toBeUndefined();

    const renamedDm = methods.channelRename({
      channelId: 'dm-ada',
      name: 'Ada Lovelace',
    });
    expect(renamedDm.ok && renamedDm.value.channel).toMatchObject({
      id: 'dm-ada',
      name: 'Ada Lovelace',
    });
    expect(renamedDm.ok && renamedDm.value.bot?.displayName).toBe('Ada Lovelace');
    expect(registry.get('ada')?.displayName).toBe('Ada Lovelace');
    const listed = await methods.channels({});
    expect(listed.ok && listed.value.channels.map((channel) => channel.id)).toEqual([
      'group-design-team',
      'dm-ada',
    ]);
  });

  it('returns only the changed channel summaries and the removed ids since a cursor (C3)', async () => {
    const { methods, channels } = setup();
    methods.create({ slug: 'ada', displayName: 'Ada' });
    const team = channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Team', members: ['ada'] });
    expect(await methods.channelListChanges({ sinceSeq: 0 })).toMatchObject({
      ok: false,
      error: { code: 'unavailable' },
    });
    const cursor = { epoch: 'e1', seq: 9 };
    const requests: unknown[] = [];
    let next: ReturnType<NonNullable<ChannelStore['readChangedChannels']>> = {
      channelIds: ['dm-ada', 'gone'],
      all: false,
      cursor,
    };
    channels.readChangedChannels = (request) => {
      requests.push(request);
      return next;
    };
    const result = await methods.channelListChanges({
      sinceSeq: 3,
      epoch: 'e1',
    });
    expect(requests).toEqual([{ sinceSeq: 3, epoch: 'e1' }]);
    expect(result.ok && result.value).toEqual({
      channels: [expect.objectContaining({ id: 'dm-ada', name: 'Ada' })],
      removed: ['gone'],
      cursor,
    });
    next = { channelIds: [], all: true, cursor };
    const all = await methods.channelListChanges({ sinceSeq: 9 });
    expect(
      all.ok && !all.value.reset && all.value.channels.map((channel) => channel.id).sort(),
    ).toEqual(['dm-ada', team.id].sort());
    next = { reset: true, cursor };
    expect(await methods.channelListChanges({ sinceSeq: 9 })).toEqual({
      ok: true,
      value: { reset: true, cursor },
    });
    expect(await methods.channelListChanges({ sinceSeq: -1 })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await methods.channelListChanges({ sinceSeq: 1, epoch: 2 })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });

  it('rejects malformed channel payloads with stable error codes', async () => {
    const { methods } = setup();
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });

    expect(methods.channelDm({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'slug is required' },
    });
    expect(methods.channelDm({ slug: 'Ada' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid slug: Ada' },
    });
    expect(methods.channelCreate({ members: [] })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'name is required' },
    });
    expect(methods.channelCreate({ name: 'Team', members: 'ada' })).toEqual({
      ok: false,
      error: {
        code: 'invalid-input',
        message: 'members must be an array of PersonaBot IDs',
      },
    });
    expect(methods.channelMessages({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'channelId is required' },
    });
    expect(methods.channelRename({ name: 'Team' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'channelId is required' },
    });
    expect(methods.channelRename({ channelId: 'dm-ada', name: '  ' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'name is required' },
    });
    expect(methods.channelRename({ channelId: 'missing', name: 'Team' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown Channel: missing' },
    });
    expect(methods.channelMessages({ channelId: 'dm-missing' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown Channel: dm-missing' },
    });
    expect(methods.channelMessages({ channelId: 'dm-ada', limit: 0 })).toEqual({
      ok: false,
      error: {
        code: 'invalid-input',
        message: 'limit must be a positive integer',
      },
    });
    expect(await methods.channelSend({ channelId: 'dm-ada', body: '   ' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'body is required' },
    });
    expect(await methods.channelSend({ channelId: 'dm-nope', body: 'hi' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown Channel: dm-nope' },
    });
  });

  it('rejects missing or cross-Channel reply targets before appending a human message', async () => {
    const { methods, channels } = setup();
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });
    const group = methods.channelCreate({ name: 'Team', members: [] });
    expect(group.ok).toBe(true);
    const groupId = group.ok ? group.value.channel.id : '';
    const source = await methods.channelSend({
      channelId: groupId,
      body: 'source',
    });
    expect(source.ok).toBe(true);
    const sourceId = source.ok ? source.value.message.id : '';

    const invalidTarget = {
      ok: false,
      error: {
        code: 'invalid-input',
        message: 'Reply target must exist in this Channel',
      },
    };
    expect(
      await methods.channelSend({
        channelId: 'dm-ada',
        body: 'cross',
        replyTo: sourceId,
      }),
    ).toEqual(invalidTarget);
    expect(
      await methods.channelSend({
        channelId: 'dm-ada',
        body: 'missing',
        replyTo: 'unknown',
      }),
    ).toEqual(invalidTarget);
    expect(
      await methods.channelSend({
        channelId: 'dm-ada',
        body: 'invalid',
        replyTo: '',
      }),
    ).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'replyTo must be a message id' },
    });
    expect(channels.revision('dm-ada')).toBe(0);

    const accepted = await methods.channelSend({
      channelId: groupId,
      body: 'answer',
      replyTo: sourceId,
    });
    expect(accepted.ok && accepted.value.message).toMatchObject({
      replyTo: sourceId,
      replyToPreview: { author: { kind: 'human' }, body: 'source' },
    });
  });
});

it('projects current network contact facts without persisting them in the Channel', async () => {
  const contact = {
    botId: 'remote:mac:ios',
    hostId: 'mac',
    botSlug: 'ios',
    displayName: 'iOS',
    device: { model: null, platform: 'darwin' },
    capabilities: [],
  };
  const botContacts = vi.fn(() => ({
    outputLimit: 12000,
    contacts: [contact],
  }));
  const refreshBotContacts = vi.fn(async () => {});
  const networkBotAvailability = vi.fn(() => 'available');
  const { channels, methods } = setup(
    [],
    [],
    () =>
      ({
        botContacts,
        refreshBotContacts,
        networkBotAvailability,
      }) as unknown as BotRuntime,
  );
  vi.spyOn(channels, 'list').mockReturnValue([
    {
      id: 'remote-dm',
      type: 'dm',
      name: 'iOS',
      members: ['caller'],
      remoteBot: { hostId: 'mac', botSlug: 'ios', displayName: 'iOS' },
      createdAt: '',
      updatedAt: '',
    },
  ]);
  expect(await methods.channels({})).toMatchObject({
    ok: true,
    value: {
      channels: [{ remoteContact: contact, remoteAvailability: 'available' }],
    },
  });
  expect(botContacts).toHaveBeenCalledWith('caller', {
    botId: 'remote:mac:ios',
  });
  expect(refreshBotContacts).toHaveBeenCalledOnce();
  expect(networkBotAvailability).toHaveBeenCalledWith('mac', 'ios');
  botContacts.mockReturnValue({ outputLimit: 12000, contacts: [] });
  networkBotAvailability.mockReturnValue('withdrawn');
  const result = await methods.channels({});
  expect(result.ok && result.value.channels[0]).not.toHaveProperty('remoteContact');
  expect(result.ok && result.value.channels[0]?.remoteAvailability).toBe('withdrawn');
});
