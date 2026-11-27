import { afterEach, expect, it } from 'vitest';
import { CHANNEL_APPROVAL_POLICY_MIGRATION } from '../src/database/migrations/channel-approval-policy.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { activityListPushSource } from '../src/push/source.js';
import { DEFAULT_CHANNEL_POLICY } from '../src/team-policy/channel-contract.js';
import { admin, alice, bob, cleanup, fixture, masked, seed } from './team-approvals-fixtures.js';
import { createFakeRosterDomain } from './roster-fixture.js';

afterEach(cleanup);

it('keeps a migrated Channel’s approval behavior and its existing role rules', async () => {
  const f = fixture();
  f.team.channelAccess.addMember(bob, f.group.id, admin.humanId);
  const ordinary = await seed(f, 'tool', 'alice-bot', f.group.id, 'bot_send_message');
  const opaque = await seed(f, 'tool');
  const read = (human: typeof alice) =>
    f.invoke(human, 'channelMessages', { channelId: f.group.id });
  const statuses = () =>
    Promise.all(
      [alice, bob, owner, admin].map(async (human) => {
        const page = JSON.stringify(await read(human));
        return [
          page.includes('bot_send_message'),
          page.includes('"toolName":"bash"'),
          ...[ordinary, opaque].map((message) => {
            try {
              f.team.approvals.requireRequest(human, f.group.id, message.id);
              return true;
            } catch {
              return false;
            }
          }),
        ];
      }),
    );
  const before = await statuses();
  expect(before).toEqual([
    [true, false, true, false],
    [false, false, false, false],
    [true, true, true, true],
    [true, true, true, true],
  ]);
  f.database.transaction((db) => {
    db.prepare(`UPDATE channel_records SET permission_table_json = json_remove(
      json_set(permission_table_json, '$.overrides', json('[{"roleId":"member","actions":{"post":"deny"}}]')),
      '$.approvalMode', '$.everyone.seeApprovals', '$.everyone.decideApprovals') WHERE channel_id = ?`).run(
      f.group.id,
    );
    CHANNEL_APPROVAL_POLICY_MIGRATION.migrate(db);
  });
  expect(await statuses()).toEqual(before);
  expect(f.team.channelAccess.view(alice, f.group.id)).toMatchObject({
    policy: {
      approvalMode: 'legacy',
      everyone: { seeApprovals: 'allow', decideApprovals: 'deny' },
      overrides: [{ roleId: 'member', actions: { post: 'deny' } }],
    },
  });
  const policy = f.team.channelAccess.view(bob, f.group.id).policy;
  await f.invoke(bob, 'channelPolicySet', {
    channelId: f.group.id,
    policy: { ...policy, everyone: { ...policy.everyone, wakeBot: 'deny' } },
  });
  expect(await statuses()).toEqual(before);
  const fresh = f.channels.createGroup(bob, { name: 'New channel', members: [] });
  expect(f.team.channelAccess.view(bob, fresh.id).policy).toEqual(DEFAULT_CHANNEL_POLICY);
});

it('shares approval visibility across card, search, Activity and push without granting decisions', async () => {
  const f = fixture();
  await f.roster.attach(createFakeRosterDomain().facility);
  const group = f.channels.createGroup(owner, {
    name: 'Approvals',
    members: ['alice-bot', 'owner-bot'],
  });
  for (const human of [alice, bob]) f.team.channelAccess.addMember(owner, group.id, human.humanId);
  const request = await seed(f, 'tool', 'alice-bot', group.id, 'bot_send_message');
  const policy = (seeApprovals: 'allow' | 'deny', decideApprovals: 'allow' | 'deny') =>
    f.invoke(owner, 'channelPolicySet', {
      channelId: group.id,
      policy: {
        ...DEFAULT_CHANNEL_POLICY,
        overrides: [{ roleId: 'member', actions: { seeApprovals, decideApprovals } }],
      },
    });
  const card = () =>
    f.invoke(bob, 'toolApprovalStatus', { channelId: group.id, messageId: request.id });
  const attempt = () =>
    f.invoke(bob, 'toolApprovalDecide', {
      channelId: group.id,
      messageId: request.id,
      outcome: 'allowed-once',
    });
  const push = () =>
    activityListPushSource(
      f.attention,
      () => undefined,
      () => ({
        toolName: 'bot_send_message',
        input: 'CONFIDENTIAL_INPUT',
        allowAlways: true,
      }),
    )
      .pending(bob)
      .items.find((item) => item.messageId === request.id);
  await policy('allow', 'deny');
  expect(await card()).toMatchObject({ approval: { masked: false, canDecide: false } });
  expect(await f.invoke(bob, 'messageSearch', { text: 'CONFIDENTIAL' })).toMatchObject({
    hits: [{ message: { id: request.id } }],
  });
  expect(push()).toMatchObject({ preview: expect.stringContaining('CONFIDENTIAL_INPUT') });
  expect(push()).not.toHaveProperty('categoryId');
  await expect(attempt()).rejects.toMatchObject({ code: 'approval-not-allowed' });
  await policy('deny', 'deny');
  const legacyWrite = {
    version: 1,
    everyone: {
      addMembers: 'allow',
      post: 'deny',
      mentionAll: 'allow',
      addBots: 'deny',
      editDetails: 'deny',
      wakeBot: 'allow',
    },
    overrides: [],
  };
  await f.invoke(owner, 'channelPolicySet', { channelId: group.id, policy: legacyWrite });
  masked(await f.invoke(bob, 'channelMessages', { channelId: group.id }), request.id);
  expect(await f.invoke(bob, 'messageSearch', { text: 'CONFIDENTIAL' })).toMatchObject({
    hits: [],
  });
  expect(f.attention.list(bob, { category: 'action', search: 'CONFIDENTIAL' }).items).toEqual([]);
  masked(push(), request.id);
  expect(push()).not.toHaveProperty('preview');
  await policy('deny', 'allow');
  expect(await card()).toMatchObject({ approval: { masked: false } });
  expect(() => f.team.approvals.requireRequest(bob, group.id, request.id)).not.toThrow();
  expect(() => f.team.approvals.requireRequest(admin, group.id, request.id)).toThrow();
  const connector = await seed(f, 'tool', 'owner-bot', group.id, 'connector_request');
  expect(() => f.team.approvals.requireRequest(bob, group.id, connector.id)).toThrow(
    'approval-not-allowed',
  );
  expect(() => f.team.approvals.requireRequest(owner, group.id, connector.id)).not.toThrow();
  const shell = await seed(f, 'tool', 'alice-bot', group.id);
  f.database.transaction((db) =>
    db
      .prepare(
        `UPDATE host_roles SET permissions_json = json_insert(permissions_json, '$[#]', 'bots.manageGrants') WHERE role_id = 'member'`,
      )
      .run(),
  );
  await expect(
    f.invoke(alice, 'toolApprovalDecide', {
      channelId: group.id,
      messageId: shell.id,
      outcome: 'allowed-once',
    }),
  ).rejects.toMatchObject({
    code: 'permission-required',
    details: { permission: 'approvals.opaqueTools' },
  });
});

it('shows an unattended tool request in the Bot owner’s Activity with masked details', async () => {
  const f = fixture();
  f.team.bots.setVisibility(owner, 'alice-bot', {
    kind: 'public',
    audience: { kind: 'everyone' },
  });
  const { role } = f.team.roles.create(owner, 'Request audience', []);
  f.team.roles.set(owner, alice.humanId, ['member', role.roleId]);
  const group = f.channels.createGroup(bob, {
    name: 'Unattended requests',
    members: ['alice-bot'],
  });
  f.team.channelAccess.visibilitySet(bob, group.id, { kind: 'roles', roleIds: [role.roleId] });
  const request = await seed(f, 'tool', 'alice-bot', group.id);
  f.team.roles.set(owner, alice.humanId, ['member']);
  const attention = () => f.attention.list(alice, { category: 'action' }).items;
  masked(attention(), request.id);
  expect(() => f.team.approvals.requireRequest(alice, group.id, request.id)).toThrow(
    'approval-not-allowed',
  );
  f.team.channelAccess.addMember(bob, group.id, admin.humanId);
  expect(attention()).not.toContainEqual(expect.objectContaining({ messageId: request.id }));
  await f.channels.appendMessage(admin, group.id, {
    id: request.id + '-decision',
    at: new Date().toISOString(),
    author: { kind: 'human', humanId: admin.humanId, displayName: 'Admin' },
    body: 'Rejected',
    replyTo: request.id,
    toolApprovalDecision: {
      requestMessageId: request.id,
      outcome: 'rejected',
      decidedBy: { humanId: admin.humanId },
    },
  });
  expect(f.channels.toolApprovalHistory?.('alice-bot', { limit: 10 })).toHaveLength(1);
  expect(await f.invoke(alice, 'toolApprovalHistory', { slug: 'alice-bot' })).toEqual({
    entries: [],
  });
});
