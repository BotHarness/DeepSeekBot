import { readFileSync } from 'node:fs';
import { openLiveFrames } from '../src/channels/live-frames.js';
import { createHumanAttentionQuery } from '../src/runtime/human-attention.js';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { TeamService } from '../src/team/service.js';
import {
  MEMBER_GLOBAL_METHODS,
  MEMBER_BOT_METHODS,
  MEMBER_CHANNEL_METHODS,
  MEMBER_APPROVAL_METHODS,
  MEMBER_METHODS,
} from '../src/team/member-methods.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { enabledFixture, cleanup } from './team-mode-fixtures.js';

afterEach(cleanup);

describe('member confidentiality', { timeout: 60_000 }, () => {
  it('never prepares a Tob during member sign-in', async () => {
    const f = await enabledFixture();
    const ensureTob = vi.fn();
    const team = new TeamService(f.database, f.channels, { ensureTob });
    const off = team.bindRuntime({
      createPeer: (principal) => new Peer(f.ctx, { principal }),
      invalidate: () => {},
      urls: () => [],
    });
    try {
      await team.signIn('bob', f.initialPassword, 'no-tob');
      expect(ensureTob).not.toHaveBeenCalled();
    } finally {
      await off();
    }
  });
  it('delivers deleted-group removals and purges only to retained members, resetting unknown tombstones', async () => {
    const f = await enabledFixture();
    const joined = f.channels.createGroup(owner, { name: 'Deleted joined', members: [] });
    const privateGroup = f.channels.createGroup(owner, { name: 'Deleted private', members: [] });
    f.team.setPublic(owner, joined.id, true);
    const controller = new AbortController();
    const frames = f.live.followRoster(f.human, controller.signal)[Symbol.asyncIterator]();
    await frames.next();
    const since = f.channels.changeCursor!();
    f.channels.deleteGroup(joined.id);
    expect(f.channels.get(joined.id)).toBeUndefined();
    expect(f.channels.hasHumanMembership?.(f.human, joined.id)).toBe(true);
    const delta = await f
      .methods(f.human)
      .channelListChanges({ sinceSeq: since.seq, epoch: since.epoch });
    expect(delta).toMatchObject({ ok: true, value: { removed: [joined.id] } });
    const permitted = {
      channelId: joined.id,
      messageId: 'deleted-visible',
      sourceEventId: 'visible-source',
    };
    f.setPlacements([
      permitted,
      { channelId: privateGroup.id, messageId: 'deleted-secret', sourceEventId: 'secret-source' },
    ]);
    f.live.publishContentPurged();
    expect((await frames.next()).value).toEqual({ type: 'purged', placements: [permitted] });
    const reopened = f.live.followRoster(f.human, controller.signal)[Symbol.asyncIterator]();
    expect((await reopened.next()).value).toEqual({ type: 'baseline', placements: [permitted] });
    f.live.publishCommitted({
      channelId: joined.id,
      revision: 99,
      message: {
        id: 'not-visible',
        at: '2026-11-14',
        author: { kind: 'human' },
        body: 'Deleted content must stay hidden',
      },
    });
    f.live.publishRosterCommitted();
    expect((await frames.next()).value).toEqual({ type: 'changed' });
    const next = f.channels.changeCursor!();
    f.channels.deleteGroup(privateGroup.id);
    const reset = await f
      .methods(f.human)
      .channelListChanges({ sinceSeq: next.seq, epoch: next.epoch });
    expect(reset).toMatchObject({ ok: true, value: { reset: true } });
    expect(JSON.stringify(reset)).not.toContain(privateGroup.id);
    controller.abort();
    await frames.return?.();
    await reopened.return?.();
  });
  it('keeps the shared member-method contract dependency-free and its denials explicit', () => {
    const source = readFileSync(new URL('../src/team/member-methods.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\bimport\b/u);
    expect(MEMBER_METHODS).toEqual(
      new Set([
        ...MEMBER_GLOBAL_METHODS,
        ...MEMBER_CHANNEL_METHODS,
        ...MEMBER_APPROVAL_METHODS,
        ...MEMBER_BOT_METHODS,
      ]),
    );
    expect(MEMBER_CHANNEL_METHODS).toContain('grantRequestApprove');
    expect(MEMBER_BOT_METHODS).toContain('grantRequestApprove');
    expect(MEMBER_METHODS.has('composerIdentity')).toBe(true);
    for (const method of ['dataReset']) expect(MEMBER_METHODS.has(method)).toBe(false);
    for (const method of ['teamModeSet', 'members', 'roles', 'create', 'createLookup'])
      expect(MEMBER_METHODS.has(method)).toBe(true);
  });
  it('returns only opaque composer ids and the calling Human, never the Owner identity', async () => {
    const f = await enabledFixture();
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const member = await f.team.signIn('bob', 'member-password-1', 'ip');
    const invoke = (peer: typeof member.peer) =>
      f.gateway.invoke({ namespace: 'botharness', method: 'composerIdentity', args: {}, peer });
    const identitySchema = z
      .object({ hostId: z.string(), profileId: z.string(), humanId: z.string() })
      .strict();
    const ownerIdentity = identitySchema.parse(
      await invoke(new Peer(f.ctx, { principal: { kind: 'owner' } })),
    );
    const memberIdentity = identitySchema.parse(await invoke(member.peer));
    expect(ownerIdentity).toEqual({
      hostId: expect.any(String),
      profileId: expect.any(String),
      humanId: owner.humanId,
    });
    expect(memberIdentity).toEqual({
      hostId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      profileId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      humanId: f.human.humanId,
    });
    expect(memberIdentity).toMatchObject({
      hostId: ownerIdentity.hostId,
      profileId: ownerIdentity.profileId,
    });
    expect(JSON.stringify(memberIdentity)).not.toContain('local-human');
    expect(JSON.stringify(memberIdentity)).not.toContain(f.channels.rootDir);
  });

  it('returns an empty member attention status when only the Owner has attention', async () => {
    const f = await enabledFixture();
    f.registry.create({ slug: 'private-attention', displayName: 'Private attention Bot' });
    const dm = f.channels.getOrCreateDm(owner, 'private-attention', 'Private attention DM')!;
    await f.channels.appendMessage(owner, dm.id, {
      id: 'owner-attention-secret',
      at: '2026-11-14T00:00:00Z',
      author: { kind: 'bot', slug: 'private-attention' },
      body: 'Owner-only attention body',
      grantRequest: true,
    });
    await f.channels.appendMessage(owner, dm.id, {
      id: 'owner-unread-secret',
      at: '2026-11-14T00:00:01Z',
      author: { kind: 'bot', slug: 'private-attention' },
      body: 'Owner-only unread body',
    });
    const query = createHumanAttentionQuery(f.database);
    const ownerStatus = query.status(owner, true);
    expect(ownerStatus.unreadCount).toBeGreaterThan(0);
    expect(ownerStatus.hasAction).toBe(true);
    expect(query.status(f.human, true)).toEqual({
      unreadCount: 0,
      hasAction: false,
      messageCounts: { replies: 0, other: 0 },
    });
    expect(f.team.belongs(f.human, dm.id)).toBe(false);
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const member = await f.team.signIn('bob', 'member-password-1', 'ip');
    await expect(
      f.gateway.invoke({
        namespace: 'botharness',
        method: 'humanAttentionStatus',
        args: { messageCounts: true },
        peer: member.peer,
      }),
    ).resolves.toEqual({
      unreadCount: 0,
      hasAction: false,
      messageCounts: { replies: 0, other: 0 },
    });
    await expect(
      f.gateway.invoke({
        namespace: 'botharness',
        method: 'humanAttentionStatus',
        args: { messageCounts: true },
        peer: new Peer(f.ctx, { principal: { kind: 'owner' } }),
      }),
    ).resolves.toEqual(ownerStatus);
  });
  it('scopes both roster carriers to current membership, including purges and queued frames', async () => {
    const f = await enabledFixture();
    f.registry.create({ slug: 'secret-bot', displayName: 'Secret Bot' });
    const dm = f.channels.getOrCreateDm(owner, 'secret-bot', 'Owner secret DM')!;
    const group = f.channels.createGroup(owner, { name: 'Shared public', members: [] });
    f.team.setPublic(owner, group.id, true);
    const privatePlacement = {
      sourceEventId: 'private-source',
      channelId: dm.id,
      messageId: 'private-message',
    };
    const publicPlacement = {
      sourceEventId: 'public-source',
      channelId: group.id,
      messageId: 'public-message',
    };
    f.setPlacements([privatePlacement, publicPlacement]);
    const abort = new AbortController();
    const sse = openLiveFrames(
      (request) => f.live.open(f.human, request),
      'scope=roster',
      '',
      abort.signal,
    );
    await sse.next();
    expect(JSON.parse((await sse.next()).value.data)).toEqual({ placements: [publicPlacement] });
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const login = await f.team.signIn('bob', 'member-password-1', 'ip');
    const typed = (
      await f.gateway.stream({
        namespace: 'botharness',
        method: 'followRoster',
        args: {},
        peer: login.peer,
        signal: abort.signal,
      })
    )[Symbol.asyncIterator]();
    expect((await typed.next()).value).toEqual({ type: 'baseline', placements: [publicPlacement] });
    const ownerFrames = f.live.followRoster(owner, abort.signal)[Symbol.asyncIterator]();
    expect((await ownerFrames.next()).value).toEqual({
      type: 'baseline',
      placements: [privatePlacement, publicPlacement],
    });
    const message = (id: string, body: string) => ({
      id,
      body,
      at: '2026-11-14T00:00:00Z',
      author: { kind: 'human' as const },
    });
    const secret = message('private-message', 'Owner DM secret body');
    const shared = message('public-message', 'Shared public body');
    f.live.publishCommitted({ channelId: dm.id, revision: 1, message: secret });
    f.live.publishCommitted({ channelId: group.id, revision: 1, message: shared });
    expect((await typed.next()).value).toEqual({
      type: 'latest',
      channelId: group.id,
      message: shared,
    });
    expect(JSON.parse((await sse.next()).value.data)).toEqual({
      channelId: group.id,
      message: shared,
    });
    expect((await ownerFrames.next()).value).toEqual({
      type: 'latest',
      channelId: dm.id,
      message: secret,
    });
    f.live.publishContentPurged();
    expect((await typed.next()).value).toEqual({ type: 'purged', placements: [publicPlacement] });
    expect(JSON.parse((await sse.next()).value.data)).toEqual({ placements: [publicPlacement] });
    f.live.publishCommitted({ channelId: group.id, revision: 2, message: shared });
    f.database.transaction((db) =>
      db
        .prepare(
          'UPDATE channel_human_members SET left_at = ? WHERE channel_id = ? AND human_id = ?',
        )
        .run('2026-11-14', group.id, f.human.humanId),
    );
    f.live.publishRosterCommitted();
    expect((await typed.next()).value).toEqual({ type: 'changed' });
    abort.abort();
    await typed.return?.();
    await sse.return(undefined);
    await ownerFrames.return?.();
  });

  it('audits every member-allowed method against Owner Channels and embedded results', async () => {
    const f = await enabledFixture();
    f.registry.create({ slug: 'owner-secret-bot', displayName: 'Owner secret Bot' });
    f.registry.create({
      slug: 'shared-bot',
      displayName: 'Shared Bot',
      ownerHumanId: f.human.humanId,
    });
    const dm = f.channels.getOrCreateDm(owner, 'owner-secret-bot', 'Owner private DM')!;
    const privateGroup = f.channels.createGroup(owner, {
      name: 'Owner private group',
      members: ['owner-secret-bot'],
    });
    const memberGroup = f.channels.createGroup(f.human, {
      name: 'Member only',
      members: ['shared-bot'],
    });
    const start = f.channels.changeCursor!();
    f.database.transaction((db) =>
      db
        .prepare(
          "UPDATE channel_records SET record_json = json_set(record_json, '$.invitations', json(?)) WHERE channel_id = ?",
        )
        .run(
          JSON.stringify([
            {
              id: 'private-invitation',
              targetBotSlug: 'owner-secret-bot',
              targetBotCreatedAt: '2026-11-14',
              inviterHuman: true,
              status: 'pending',
              createdAt: '2026-11-14',
            },
          ]),
          memberGroup.id,
        ),
    );
    f.team.setPublic(owner, memberGroup.id, true);
    for (const channel of [dm, privateGroup, memberGroup])
      await f.channels.appendMessage(owner, channel.id, {
        id: `message-${channel.id}`,
        at: '2026-11-14T00:00:00Z',
        author: { kind: 'bot', slug: channel === memberGroup ? 'shared-bot' : 'owner-secret-bot' },
        body:
          channel === memberGroup ? 'visible member text' : 'Confidential Owner message body text',
      });
    f.database.transaction((db) => {
      for (const channel of [dm, privateGroup, memberGroup])
        db.prepare(
          "UPDATE source_events SET payload_json = json_set(payload_json, '$.attachments', json(?)) WHERE source_event_id IN (SELECT source_event_id FROM channel_placements WHERE channel_id = ?)",
        ).run(
          JSON.stringify([
            {
              fileId: 'file:6a1f3c2e-1b2c-4d3e-8f40-123456789abc',
              name: channel === memberGroup ? 'member.txt' : 'Owner private file',
              mime: 'text/plain',
              size: 1,
            },
          ]),
          channel.id,
        );
    });
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const login = await f.team.signIn('bob', 'member-password-1', 'ip');
    f.setPlacements([
      { sourceEventId: 'secret-source', channelId: dm.id, messageId: `message-${dm.id}` },
    ]);
    await f.channels.appendMessage(f.human, memberGroup.id, {
      id: 'audit-question',
      at: '2026-11-14T00:01:00Z',
      author: { kind: 'bot', slug: 'shared-bot' },
      body: 'Member question',
      userQuestionRequest: {
        sessionId: 'member-question',
        questions: [{ id: 'pick', question: 'Pick', options: [{ label: 'Yes' }] }],
      },
    });
    const args: Record<string, Record<string, unknown>> = {
      usageByMember: { period: 'week' },
      overviewUsage: { period: 'week' },
      get: { slug: 'owner-secret-bot' },
      modelPlan: { slug: 'owner-secret-bot' },
      modelPlanInherit: { slug: 'owner-secret-bot', expectedRevision: 0 },
      userQuestionStatus: { messageId: 'audit-question' },
      userQuestionAnswer: {
        messageId: 'audit-question',
        answer: { answers: [{ id: 'pick', selected: ['Yes'] }] },
      },
      roleCreate: { name: 'Operators', permissions: [] },
      roleUpdate: { roleId: 'member' },
      roleDelete: { roleId: 'member' },
      memberCreate: { username: 'carol', displayName: 'Carol' },
      memberRolesSet: { humanId: owner.humanId, roleIds: ['member'] },
      memberDevices: { humanId: f.human.humanId },
      memberDeviceRevoke: { humanId: f.human.humanId, grantId: 'absent' },
      ownerTransfer: { humanId: f.human.humanId, password: 'owner-password-1' },
      teamModeSet: { enabled: true },
      teamInsecureHttpSet: { allowed: false },
      teamOwnerPasswordSet: { password: 'replacement-password' },
      channelPublicSet: { channelId: memberGroup.id, public: true },
      memberPasswordReset: { humanId: f.human.humanId },
      memberDeactivate: { humanId: f.human.humanId },
      memberReactivate: { humanId: f.human.humanId },
      memberTransferPreview: { humanId: f.human.humanId },
      memberTransfer: { humanId: f.human.humanId, toHumanId: owner.humanId },
      memberPurgePreview: { humanId: f.human.humanId },
      memberPurgeConfirm: { humanId: f.human.humanId, token: 'invalid', username: 'bob' },
      memberPasswordChange: { current: 'member-password-1', next: 'member-password-2' },
      privateContentOpen: { kind: 'bot', objectId: 'owner-secret-bot' },
      privateContentPage: { viewId: 'missing', before: 'missing' },
      channelListChanges: { sinceSeq: start.seq, epoch: start.epoch },
      channelSearch: { text: 'text' },
      channelMarkRead: { messageId: `message-${memberGroup.id}` },
      channelReact: { messageId: `message-${memberGroup.id}`, emoji: '👍', active: true },
      channelSend: { body: 'member test send' },
      channelSendStatus: { messageId: `message-${memberGroup.id}` },
      channelJournalPage: { through: f.channels.revision(memberGroup.id) },
      channelChanges: { sinceSeq: start.seq, epoch: start.epoch },
      create: { displayName: 'Member Bot' },
      createLookup: { operationKey: 'audit-create-0001', displayName: 'Member Bot' },
      marketplaceAvatarDetail: { id: '00000000-0000-4000-8000-000000000000' },
      followChannel: { limit: 10 },
    };
    const forbidden = [
      dm.id,
      dm.name,
      privateGroup.id,
      privateGroup.name,
      'Confidential Owner message body',
      'owner-secret-bot',
      'Owner secret Bot',
      'Owner private file',
    ];
    const streams = new Set(['followRoster', 'followChannel', 'followActivity']);
    const m4 = new Set([
      'channelRoleDirectory',
      'channelVisibilitySet',
      'channelAdminsSet',
      'channelPolicySet',
      'teamDirectory',
      'humanDm',
      'humanDmByUsername',
      'channelCreate',
      'messageSearch',
      'channelGet',
      'channelRename',
      'channelDescriptionSet',
      'channelHumanAdd',
      'channelMemberCandidates',
      'channelGroupInvite',
      'channelAllBotPreview',
      'composerValidate',
      'channelSendStatus',
    ]);
    const table = [...MEMBER_GLOBAL_METHODS, ...MEMBER_CHANNEL_METHODS].filter(
      (method) => !m4.has(method),
    );
    for (const method of table) {
      const abort = new AbortController();
      const request = {
        namespace: 'botharness',
        method,
        peer: login.peer,
        signal: abort.signal,
        args: {
          ...(MEMBER_CHANNEL_METHODS.some((name) => name === method)
            ? { channelId: memberGroup.id }
            : {}),
          ...args[method],
        },
      };
      let result: unknown;
      try {
        if (streams.has(method)) {
          const iterator = (await f.gateway.stream(request))[Symbol.asyncIterator]();
          result = (await iterator.next()).value;
          abort.abort();
          await iterator.return?.();
        } else result = await f.gateway.invoke(request);
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? error.code : undefined;
        if (
          [
            'privateObjects',
            'privateContentOpen',
            'privateContentPage',
            'auditLog',
            'auditVerify',
            'roles',
            'roleCreate',
            'roleUpdate',
            'roleDelete',
            'members',
            'memberCreate',
            'memberRolesSet',
            'memberPasswordReset',
            'memberDeactivate',
            'memberReactivate',
            'memberTransferPreview',
            'memberTransfer',
            'memberPurgePreview',
            'memberPurgeConfirm',
            'memberDevices',
            'memberDeviceRevoke',
            'ownerTransfer',
            'teamModeSet',
            'teamInsecureHttpSet',
            'teamOwnerPasswordSet',
            'channelPublicSet',
          ].includes(method)
        )
          expect(['permission-required', 'device-not-found']).toContain(code);
        else if (method === 'spaceAudienceDirectory')
          expect(error).toMatchObject({
            code: 'permission-required',
            details: { permission: 'workspaces.manageShared' },
          });
        else if (method === 'voiceProviders')
          expect(error).toMatchObject({ code: 'voice-unavailable' });
        else if (method === 'marketplaceAvatarList' || method === 'marketplaceAvatarDetail')
          expect(error).toMatchObject({ code: 'marketplace-unavailable' });
        else if (method === 'usageByMember')
          expect(error).toMatchObject({
            code: 'permission-required',
            details: { permission: 'usage.view' },
          });
        else
          expect([
            'unavailable',
            'creation-unavailable',
            'permission-required',
            'storage-unavailable',
            'member-not-found',
            'invalid-input',
            'skill-not-found',
          ]).toContain(code);
        result = { code };
      } finally {
        abort.abort();
      }
      const encoded = JSON.stringify(result) ?? '';
      for (const value of forbidden)
        expect.soft(encoded, `${method} exposed ${value}`).not.toContain(value);
      if (
        [
          'channelMessages',
          'channelTimeline',
          'channelSearch',
          'channelJournalPage',
          'channelFilesPage',
          'channelChanges',
          'followChannel',
        ].includes(method)
      )
        expect(encoded, `${method} did not exercise a nonempty member page`).toContain(
          'visible member text',
        );
    }
    for (const method of MEMBER_CHANNEL_METHODS) {
      const request = {
        namespace: 'botharness',
        method,
        peer: login.peer,
        args: { channelId: dm.id, ...args[method] },
      };
      await expect(
        streams.has(method) ? f.gateway.stream(request) : f.gateway.invoke(request),
      ).rejects.toMatchObject({ code: 'remote-access/denied' });
    }
    await expect(
      f.gateway.invoke({
        namespace: 'botharness',
        method: 'channelGet',
        args: { channelId: memberGroup.id },
        peer: login.peer,
      }),
    ).resolves.toMatchObject({ role: 'owner' });
    await expect(
      f.gateway.invoke({
        namespace: 'botharness',
        method: 'channelSendStatus',
        args: { channelId: memberGroup.id, messageId: `message-${memberGroup.id}` },
        peer: login.peer,
      }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    for (const method of ['channelGroupDelete', 'channelGroupWakeSet'])
      await expect(
        f.gateway.invoke({
          namespace: 'botharness',
          method,
          args: { channelId: memberGroup.id },
          peer: login.peer,
        }),
      ).rejects.toMatchObject({ code: 'remote-access/denied' });
    expect(
      await f.gateway.invoke({
        namespace: 'botharness',
        method: 'channelListChanges',
        args: { sinceSeq: start.seq, epoch: start.epoch },
        peer: new Peer(f.ctx, { principal: { kind: 'owner' } }),
      }),
    ).toMatchObject({ reset: true });
    expect(
      await f.gateway.invoke({
        namespace: 'botharness',
        method: 'channels',
        args: {},
        peer: new Peer(f.ctx, { principal: { kind: 'owner' } }),
      }),
    ).toMatchObject({ channels: expect.arrayContaining([expect.objectContaining({ id: dm.id })]) });
  });
});
