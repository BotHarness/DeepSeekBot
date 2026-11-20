import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, it } from 'vitest';
import type { MessagingInboundEvent } from '../src/messaging/provider.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import {
  fingerprint,
  dm,
  mention,
  fixture,
  ordinaryRole,
  fresh,
  cleanup,
} from './messaging-default-traffic-fixtures.js';

afterEach(cleanup);

function slackDm(
  id: string,
  overrides: Partial<MessagingInboundEvent> = {},
): MessagingInboundEvent {
  return fresh(
    dm(id, {
      channel: 'slack',
      actor: { kind: 'user', id: 'UQAUSER1', name: 'Slack applicant' },
      conversation: { kind: 'dm', id: 'DQA1' },
      reply: { messageId: `om-${id}`, conversationId: 'DQA1', actorId: 'UQAUSER1' },
      ...overrides,
    }),
  );
}

it('Slack ordinary DM pairing only executes a fresh reviewed request and queries scoped current permissions after restart', async () => {
  const fx = await fixture('slack');
  const role = await ordinaryRole(fx);
  const blocked = slackDm('slack-unknown', { text: 'PRIVATE UNAPPROVED SLACK REQUEST' });
  await fx.receive(blocked);
  await fx.receive(blocked);
  expect(fx.runs).toHaveLength(0);
  expect(fx.admissions()).toEqual([]);
  expect(fx.query('SELECT * FROM source_events')).toEqual([]);
  expect(fx.query('SELECT * FROM assignments')).toEqual([]);
  const request = fx.core.externalMessaging.pairing.list('ada')[0]!;
  expect(request).toMatchObject({
    purpose: 'conversation',
    status: 'pending',
    attempts: 1,
    capabilities: [],
  });
  expect(JSON.stringify(request)).not.toContain(blocked.text);
  expect(fx.replies).toHaveLength(1);
  expect(fx.replies[0]!.text).not.toContain(blocked.text);
  expect((await fx.core.externalMessaging.snapshot('ada')).pairingReceivers).toHaveLength(1);
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  const review = {
    kind: 'approve' as const,
    id: request.id,
    expectedRevision: request.revision,
    roleId: role.id,
    expectedRoleRevision: role.revision,
  };
  expect(await methods.pairingReview({ slug: 'ada', input: review })).toMatchObject({
    ok: true,
    value: { pairing: { roleId: role.id, capabilities: [] } },
  });
  expect(fx.replies.at(-1)!.text).toContain('send your question again');
  expect(fx.runs).toHaveLength(0);
  await fx.restart();
  await fx.receive(blocked);
  expect(fx.admissions()).toEqual([]);
  await fx.receive(slackDm('slack-new'));
  expect(fx.runs).toHaveLength(1);
  expect(fx.runs[0]!.inbox).toContain('slack-workspace-user-id');
  expect(fx.runs[0]!.inbox).not.toContain(role.behavior);
  expect(fx.runs[0]!.inbox).not.toContain(blocked.text);
  const source = fx.sourceId('om-slack-new');
  expect(fx.core.externalMessaging.senderPermissions('ada', source)).toMatchObject({
    status: 'paired',
    role,
    sender: {
      actorId: 'UQAUSER1',
      providerId: 'dsh-im/slack',
      namespace: 'slack-workspace-user-id',
    },
  });
  expect(fx.core.externalMessaging.directory('ada', { kind: 'people' }).rows).toEqual([
    expect.objectContaining({ actorId: 'UQAUSER1', namespace: 'slack-workspace-user-id', role }),
  ]);
  await fx.core.externalMessaging.reply('ada', source, 'Fresh Slack answer');
  expect(fx.replies.at(-1)).toMatchObject({
    route: { conversationId: 'DQA1', actorId: 'UQAUSER1', messageId: 'om-slack-new' },
    text: 'Fresh Slack answer',
  });
  const approved = fx.core.externalMessaging.pairing.list('ada')[0]!;
  expect(
    await createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core }).pairingReview({
      slug: 'ada',
      input: { kind: 'revoke', id: approved.id, expectedRevision: approved.revision },
    }),
  ).toMatchObject({ ok: true });
  expect(fx.core.externalMessaging.senderPermissions('ada', source)).toMatchObject({
    status: 'revoked',
  });
  await fx.receive(slackDm('slack-revoked'));
  expect(fx.runs).toHaveLength(1);
  expect(fx.admissions()).toHaveLength(1);
  expect(fx.core.externalMessaging.directory('ada', { kind: 'people' }).rows).toEqual([]);
});

it('Slack ordinary pairing refuses untrusted routes and does not enable native management or group pairing', async () => {
  const fx = await fixture('slack');
  await ordinaryRole(fx);
  for (const bad of [
    slackDm('slack-name', { actor: { kind: 'user', id: 'display-name', name: 'UQAUSER1' } }),
    slackDm('slack-copied', {
      reply: { messageId: 'om-slack-copied', conversationId: 'DOTHER', actorId: 'UQAUSER1' },
    }),
    slackDm('slack-other-app', { botId: 'other-app' }),
    slackDm('slack-other-workspace', { fingerprint: 'd'.repeat(64) }),
  ]) {
    await fx.receive(bad).catch(() => undefined);
    expect(fx.runs).toHaveLength(0);
    expect(fx.admissions()).toEqual([]);
    expect(fx.core.externalMessaging.pairing.list('ada')).toEqual([]);
  }
  await fx.receive(slackDm('slack-control', { text: '/pair' }));
  expect(fx.runs).toHaveLength(0);
  expect(fx.core.externalMessaging.pairing.list('ada')).toEqual([]);
  const group = slackDm('slack-group', {
    conversation: { kind: 'group', id: 'CQA1' },
    mentionedAccount: true,
    reply: { messageId: 'om-slack-group', conversationId: 'CQA1', actorId: 'UQAUSER1' },
  });
  expect(() =>
    fx.core.externalMessaging.pairing.request(fx.identity.id, group, 'conversation'),
  ).toThrow('untrusted-pairing');
  expect(() =>
    fx.core.externalMessaging.pairing.request(
      fx.identity.id,
      slackDm('slack-management', { text: '/pair' }),
      'management',
    ),
  ).toThrow('untrusted-pairing');
});

it('Slack replacement Binding and a fresh re-pair never inherit the old ordinary authorization', async () => {
  const fx = await fixture('slack');
  const role = await ordinaryRole(fx);
  await fx.receive(slackDm('slack-before-rebind'));
  const first = fx.core.externalMessaging.pairing.list('ada')[0]!;
  fx.core.externalMessaging.pairing.review('ada', {
    kind: 'approve',
    id: first.id,
    expectedRevision: first.revision,
    roleId: role.id,
    expectedRoleRevision: role.revision,
  });
  const current = (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
  await fx.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: current.id,
    expectedRevision: current.revision,
  });
  await fx.core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/slack',
    accountRef: 'lark-app',
    fingerprint,
  });
  await fx.settle();
  await fx.receive(slackDm('slack-after-rebind'));
  expect(fx.runs).toHaveLength(0);
  const pending = fx.core.externalMessaging.pairing
    .list('ada')
    .find((p) => p.status === 'pending')!;
  expect(pending.bindingId).not.toBe(first.bindingId);
  expect(pending.roleId).toBeUndefined();
  expect(pending.permissionExceptions).toBeUndefined();
  expect(fx.core.externalMessaging.directory('ada', { kind: 'people' }).rows).toEqual([]);
});

it('unknown Lark requests are bounded controls; Web ordinary-role review asks again and only fresh messages run', async () => {
  const fx = await fixture();
  const role = await ordinaryRole(fx);
  const blocked = fresh(dm('unknown', { text: 'PRIVATE BLOCKED BODY' }));
  await fx.receive(blocked);
  await fx.receive(blocked);
  expect(fx.runs).toHaveLength(0);
  expect(fx.admissions()).toEqual([]);
  expect(fx.query('SELECT * FROM source_events')).toEqual([]);
  expect(fx.query('SELECT * FROM assignments')).toEqual([]);
  const request = fx.core.externalMessaging.pairing.list('ada')[0]!;
  expect(request).toMatchObject({
    purpose: 'conversation',
    status: 'pending',
    capabilities: [],
    attempts: 1,
  });
  expect(JSON.stringify(request)).not.toContain(blocked.text);
  expect(fx.replies).toHaveLength(1);
  expect(fx.replies[0]!.text).not.toContain(blocked.text);
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  const review = {
    kind: 'approve' as const,
    id: request.id,
    expectedRevision: request.revision,
    roleId: role.id,
    expectedRoleRevision: role.revision,
  };
  expect(await methods.pairingReview({ slug: 'ada', input: review })).toMatchObject({
    ok: true,
    value: { pairing: { roleId: role.id, capabilities: [] } },
  });
  expect(fx.replies.at(-1)!.text).toContain('send your question again');
  expect(fx.runs).toHaveLength(0);
  await fx.receive(blocked);
  expect(fx.admissions()).toEqual([]);
  await fx.receive(fresh(dm('new')));
  expect(fx.runs).toHaveLength(1);
  expect(fx.runs[0]!.inbox).not.toContain('Colleague');
  expect(fx.runs[0]!.inbox).not.toContain(role.behavior);
  expect(fx.runs[0]!.inbox).toContain('lark-app-open-id');
  const permissions = fx.runs[0]!.externalMessaging!.senderPermissions!(fx.sourceId('om-new'));
  expect(permissions).toMatchObject({
    status: 'paired',
    role,
    policyRevision: 1,
    sender: { actorId: 'ou_owner', bindingId: fx.identity.id },
  });
  expect(Number.isFinite(Date.parse(permissions.queriedAt))).toBe(true);
  expect(() =>
    fx.core.externalMessaging.senderPermissions('another-bot', fx.sourceId('om-new')),
  ).toThrow();
  expect(() => fx.core.externalMessaging.senderPermissions('ada', 'guessed-source')).toThrow(
    'source-unavailable',
  );
  expect(fx.runs[0]!.inbox).not.toContain(blocked.text);
  expect(() =>
    fx.core.externalMessaging.pairing.assert('ada', fx.identity.id, 'ou_owner', 'approve'),
  ).toThrow('pairing-unauthorized');
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-new'), 'Fresh reply');
  expect(fx.replies.at(-1)).toMatchObject({
    route: { messageId: 'om-new', conversationId: 'oc_owner' },
    text: 'Fresh reply',
  });
  const paired = fx.core.externalMessaging.pairing.list('ada')[0]!;
  await methods.pairingReview({
    slug: 'ada',
    input: { kind: 'revoke', id: paired.id, expectedRevision: paired.revision },
  });
  expect(fx.core.externalMessaging.senderPermissions('ada', fx.sourceId('om-new'))).toMatchObject({
    status: 'revoked',
  });
  expect(
    fx.core.externalMessaging.senderPermissions('ada', fx.sourceId('om-new')).role,
  ).toBeUndefined();
  await fx.receive(fresh(dm('revoked')));
  expect(fx.runs).toHaveLength(1);
  expect(fx.admissions()).toHaveLength(1);
});

it('ordinary pairing survives restart and reuses only the same app identity across allowed conversations', async () => {
  const fx = await fixture();
  const role = await ordinaryRole(fx);
  expect(Number.isFinite(Date.parse(role.createdAt!))).toBe(true);
  expect(role.updatedAt).toBe(role.createdAt);
  await fx.receive(fresh(mention('group')));
  const request = fx.core.externalMessaging.pairing.list('ada')[0]!;
  await fx.core.externalMessaging.reviewPairing('ada', {
    kind: 'approve',
    id: request.id,
    expectedRevision: 1,
    roleId: role.id,
    expectedRoleRevision: 1,
  });
  await fx.restart();
  expect((await fx.core.externalMessaging.snapshot('ada')).roles![0]).toEqual(role);
  await fx.receive(fresh(dm('after-restart')));
  expect(fx.runs).toHaveLength(1);
  expect(fx.admissions()).toEqual([{ reason: 'human-dm', messageId: 'om-after-restart' }]);
  const current = (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
  await fx.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: current.id,
    expectedRevision: current.revision,
  });
  await fx.core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/feishu',
    accountRef: 'lark-app',
    fingerprint,
  });
  await fx.settle();
  await fx.receive(fresh(dm('rebound')));
  expect(fx.runs).toHaveLength(1);
  expect(
    fx.core.externalMessaging.pairing.list('ada').filter((item) => item.status === 'pending'),
  ).toHaveLength(1);
});

it('failed re-ask notification preserves approval and stale review never launches or replays a request', async () => {
  const fx = await fixture();
  const role = await ordinaryRole(fx);
  await fx.receive(fresh(dm('failure')));
  const request = fx.core.externalMessaging.pairing.list('ada')[0]!;
  fx.prepareReply(async () => {
    throw new Error('offline');
  });
  const input = {
    kind: 'approve' as const,
    id: request.id,
    expectedRevision: 1,
    roleId: role.id,
    expectedRoleRevision: 1,
  };
  const approved = await fx.core.externalMessaging.reviewPairing('ada', input);
  expect(approved.status).toBe('approved');
  expect(approved.notifications?.at(-1)).toMatchObject({ outcome: 'unconfirmed', attempts: 1 });
  await expect(fx.core.externalMessaging.reviewPairing('ada', input)).rejects.toThrow(
    'pairing-stale',
  );
  expect(fx.runs).toEqual([]);
  expect(fx.admissions()).toEqual([]);
  fx.prepareReply(async () => {});
  await fx.receive(fresh(dm('later')));
  expect(fx.runs).toHaveLength(1);
});

it.each(['restrict', 'revoke'] as const)(
  'pending collected messages close with a supported durable state on %s',
  async (action) => {
    const fx = await fixture();
    let pairing;
    if (action === 'revoke') {
      const role = await ordinaryRole(fx);
      await fx.receive(fresh(dm('pending-pair')));
      pairing = fx.core.externalMessaging.pairing.list('ada')[0]!;
      fx.core.externalMessaging.pairing.review('ada', {
        kind: 'approve',
        id: pairing.id,
        expectedRevision: pairing.revision,
        roleId: role.id,
        expectedRoleRevision: role.revision,
      });
    }
    await fx.receive(fresh(mention('pending-bootstrap')));
    const {
      revision,
      changedAt: _at,
      ...preferences
    } = fx.core.externalMessaging.defaults('feishu');
    await fx.core.externalMessaging.setDefaults({
      ...preferences,
      expectedRevision: revision,
      collection: 'all',
      wake: 'digest',
      count: 100,
      intervalSeconds: 86400,
    });
    await fx.receive(fresh(mention('pending-collected', false)));
    const source = fx.sourceId('om-pending-collected');
    expect(
      fx.query(`SELECT attempt_state FROM inbox_admissions WHERE source_event_id = '${source}'`),
    ).toEqual([{ attempt_state: 'pending' }]);
    const runs = fx.runs.length;
    if (pairing)
      fx.core.externalMessaging.pairing.review('ada', {
        kind: 'revoke',
        id: pairing.id,
        expectedRevision: 2,
      });
    else await ordinaryRole(fx);
    expect(
      fx.query(
        `SELECT attempt_state, wake_count, wake_interval_ms, ignored_at IS NOT NULL AS ignored FROM inbox_admissions WHERE source_event_id = '${source}'`,
      ),
    ).toEqual([{ attempt_state: 'handled', wake_count: null, wake_interval_ms: null, ignored: 1 }]);
    await fx.restart();
    expect(fx.runs).toHaveLength(runs);
  },
);

it('automatic pairing acknowledges intake before a checked reply enters the Provider transition queue', async () => {
  const fx = await fixture();
  await ordinaryRole(fx);
  let intakeReturned = false;
  fx.prepareReply(async () => {
    if (!intakeReturned) throw new Error('provider-transition-still-locked');
  });
  await fx.receive(fresh(dm('queue-fence')), () => {
    intakeReturned = true;
  });
  expect(fx.replies).toHaveLength(1);
  expect(fx.core.externalMessaging.pairing.list('ada')[0]!.notifications?.[0]?.outcome).toBe(
    'accepted',
  );
  expect(fx.admissions()).toEqual([]);
});

it('restricted chatting preserves explicit management pairing without granting ordinary chat eligibility', async () => {
  const fx = await fixture();
  await ordinaryRole(fx);
  await fx.receive(fresh({ ...dm('management'), text: '/pair' }));
  const management = fx.core.externalMessaging.pairing.list('ada')[0]!;
  expect(management.purpose ?? 'management').toBe('management');
  await fx.core.externalMessaging.reviewPairing('ada', {
    kind: 'approve',
    id: management.id,
    expectedRevision: management.revision,
    capabilities: ['approve'],
  });
  expect(() =>
    fx.core.externalMessaging.pairing.assert('ada', fx.identity.id, 'ou_owner', 'approve'),
  ).not.toThrow();
  await fx.receive(fresh(dm('still-needs-chat-role')));
  expect(fx.runs).toEqual([]);
  expect(fx.admissions()).toEqual([]);
  expect(
    fx.core.externalMessaging.pairing.list('ada').filter((item) => item.purpose === 'conversation'),
  ).toMatchObject([{ status: 'pending', capabilities: [] }]);
});

it('chat review refuses a different Bot role and an outdated role revision', async () => {
  const fx = await fixture();
  const ownRole = await ordinaryRole(fx);
  expect(fx.core.registry.create({ slug: 'grace', displayName: 'Grace' }).ok).toBe(true);
  fx.core.externalMessaging.senderAccess('grace', {
    kind: 'create-role',
    name: 'Other Bot role',
    behavior: 'Another Bot policy',
  });
  const foreignRole = (await fx.core.externalMessaging.snapshot('grace')).roles![0]!;
  await fx.receive(fresh(dm('role-review')));
  const request = fx.core.externalMessaging.pairing.list('ada')[0]!;
  for (const role of [foreignRole, { ...ownRole, revision: ownRole.revision + 1 }])
    await expect(
      fx.core.externalMessaging.reviewPairing('ada', {
        kind: 'approve',
        id: request.id,
        expectedRevision: request.revision,
        roleId: role.id,
        expectedRoleRevision: role.revision,
      }),
    ).rejects.toThrow('role-stale');
  expect(fx.core.externalMessaging.pairing.list('ada')[0]!.status).toBe('pending');
  expect(fx.runs).toEqual([]);
});

it('keeps /pair with pairing and admits nothing for it', async () => {
  const fx = await fixture();
  await fx.receive(dm('pair', { text: '/pair' }));
  expect(fx.admissions()).toEqual([]);
  expect(fx.entries()).toEqual([]);
  expect((await fx.core.externalMessaging.snapshot('ada')).pairings).toHaveLength(1);
});
