import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, it, vi } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import { createDshImProvider } from '../src/messaging/dsh-im.js';
import { readSourceSenderPermissions } from '../src/messaging/sender-access.js';
import {
  fingerprint,
  dm,
  mention,
  fixture,
  ordinaryRole,
  fresh,
  asActor,
  cleanup,
} from './messaging-default-traffic-fixtures.js';

afterEach(cleanup);

it('queries pageable current people, configured conversations and observed paired people without changing authority', async () => {
  const fx = await fixture();
  const role = await ordinaryRole(fx);
  const approve = async (actorId: string) => {
    await fx.receive(fresh(asActor(dm(`request-${actorId}`), actorId)));
    const request = fx.core.externalMessaging.pairing
      .list('ada')
      .find((p) => p.actorId === actorId)!;
    await fx.core.externalMessaging.reviewPairing('ada', {
      kind: 'approve',
      id: request.id,
      expectedRevision: request.revision,
      roleId: role.id,
      expectedRoleRevision: role.revision,
    });
  };
  await approve('ou_owner');
  await approve('ou_unobserved');
  expect(fx.runs).toEqual([]);
  await fx.receive(fresh(mention('directory-anchor')));
  const sourceEventId = fx.sourceId('om-directory-anchor');
  const query = fx.runs.at(-1)!.externalMessaging!.directory!;
  const before = {
    admissions: fx.admissions().length,
    replies: fx.replies.length,
    runs: fx.runs.length,
  };
  const first = query({ kind: 'people', limit: 1 });
  expect(first.rows).toHaveLength(1);
  expect(first.nextCursor).toBeDefined();
  const second = query({ kind: 'people', limit: 1, cursor: first.nextCursor! });
  expect(second.rows).toHaveLength(1);
  expect(second.nextCursor).toBeUndefined();
  expect([...first.rows, ...second.rows]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ actorId: 'ou_owner', role }),
      expect.objectContaining({ actorId: 'ou_unobserved', role }),
    ]),
  );
  expect(() => query({ kind: 'conversations', cursor: first.nextCursor! })).toThrow(
    'directory-cursor-invalid',
  );
  expect(() => query({ kind: 'people', limit: 51 })).toThrow();
  expect(() => query({ kind: 'observed-people' })).toThrow('directory-source-required');
  expect(() => query({ kind: 'observed-people', sourceEventId: 'guessed' })).toThrow(
    'source-unavailable',
  );
  const conversations = query({ kind: 'conversations', limit: 1 });
  expect(conversations.nextCursor).toBeDefined();
  expect(
    query({ kind: 'conversations', limit: 1, cursor: conversations.nextCursor! }).rows,
  ).toHaveLength(1);
  expect(query({ kind: 'conversations' }).rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        bindingId: fx.identity.id,
        conversation: expect.objectContaining({ id: 'oc_team' }),
        state: 'allowed',
      }),
    ]),
  );
  const observed = query({ kind: 'observed-people', sourceEventId });
  expect(observed.rows).toEqual([
    expect.objectContaining({
      actorId: 'ou_owner',
      role,
      firstObservedAt: expect.any(String),
      lastObservedAt: expect.any(String),
    }),
  ]);
  expect(observed.coverage).toMatchObject({
    incomplete: true,
    currentPlatformMembership: false,
    scanTruncated: false,
  });
  expect(fx.admissions()).toHaveLength(before.admissions);
  expect(fx.replies).toHaveLength(before.replies);
  expect(fx.runs).toHaveLength(before.runs);
  const request = fx.core.externalMessaging.pairing
    .list('ada')
    .find((p) => p.actorId === 'ou_owner')!;
  await fx.core.externalMessaging.reviewPairing('ada', {
    kind: 'revoke',
    id: request.id,
    expectedRevision: request.revision,
  });
  expect(query({ kind: 'people' }).rows).toEqual([
    expect.objectContaining({ actorId: 'ou_unobserved' }),
  ]);
  expect(query({ kind: 'observed-people', sourceEventId }).rows).toEqual([]);
  expect(fx.core.registry.create({ slug: 'grace', displayName: 'Grace' }).ok).toBe(true);
  expect(fx.core.externalMessaging.directory('grace', { kind: 'people' }).rows).toEqual([]);
  expect(() =>
    fx.core.externalMessaging.directory('grace', { kind: 'observed-people', sourceEventId }),
  ).toThrow('source-unavailable');
});

it('observations respect shared-source access and purge without treating other App identities as paired people', async () => {
  const fx = await fixture();
  const role = await ordinaryRole(fx);
  for (const actorId of ['ou_owner', 'ou_colleague']) {
    await fx.receive(fresh(asActor(dm(`request-${actorId}`), actorId)));
    const request = fx.core.externalMessaging.pairing
      .list('ada')
      .find((p) => p.actorId === actorId)!;
    await fx.core.externalMessaging.reviewPairing('ada', {
      kind: 'approve',
      id: request.id,
      expectedRevision: request.revision,
      roleId: role.id,
      expectedRoleRevision: role.revision,
    });
  }
  await fx.receive(fresh(mention('purge-anchor')));
  await fx.receive(fresh(asActor(mention('purge-colleague'), 'ou_colleague')));
  const anchor = fx.sourceId('om-purge-anchor');
  const colleague = fx.sourceId('om-purge-colleague');
  expect(
    fx.core.externalMessaging.directory('ada', { kind: 'observed-people', sourceEventId: anchor })
      .rows,
  ).toHaveLength(2);
  expect(fx.core.registry.create({ slug: 'grace', displayName: 'Grace' }).ok).toBe(true);
  const group = fx.core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
    name: 'Shared QA evidence',
    members: ['ada', 'grace'],
  });
  fx.core.externalMessaging.inbound.share('ada', colleague, group.id);
  expect(fx.core.externalMessaging.inbound.readShared('grace', colleague).event.actor.id).toBe(
    'ou_colleague',
  );
  expect(() =>
    fx.core.externalMessaging.directory('grace', {
      kind: 'observed-people',
      sourceEventId: colleague,
    }),
  ).toThrow('directory-scope-unavailable');
  fx.core.channels.deleteGroup(group.id);
  const preview = fx.core.contentPurge.preview(OWNER_HUMAN_CONTEXT, group.id, [colleague]);
  fx.core.contentPurge.confirm(
    OWNER_HUMAN_CONTEXT,
    group.id,
    preview.sourceEventIds,
    preview.token,
  );
  expect(
    fx.core.externalMessaging.directory('ada', { kind: 'observed-people', sourceEventId: anchor })
      .rows,
  ).toEqual([expect.objectContaining({ actorId: 'ou_owner' })]);
  expect(() =>
    fx.core.externalMessaging.directory('ada', {
      kind: 'observed-people',
      sourceEventId: colleague,
    }),
  ).toThrow('content-purged');
  await fx.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: fx.identity.id,
    expectedRevision: fx.identity.revision,
  });
  const replacement = await fx.core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/feishu',
    accountRef: 'lark-app',
    fingerprint,
  });
  expect(replacement.id).not.toBe(fx.identity.id);
  expect(fx.core.externalMessaging.directory('ada', { kind: 'people' }).rows).toEqual([]);
  expect(fx.core.externalMessaging.directory('ada', { kind: 'conversations' }).rows).toEqual([]);
});

it('one active run refreshes role edits and reassignment while dated permission results and legacy management remain distinct', async () => {
  const fx = await fixture();
  const role = await ordinaryRole(fx);
  await fx.receive(fresh(dm('role-request')));
  const pending = fx.core.externalMessaging.pairing.list('ada')[0]!;
  fx.core.externalMessaging.pairing.review('ada', {
    kind: 'approve',
    id: pending.id,
    expectedRevision: pending.revision,
    roleId: role.id,
    expectedRoleRevision: role.revision,
  });
  await fx.receive(fresh(dm('role-question')));
  const lookup = fx.runs[0]!.externalMessaging!.senderPermissions!;
  const source = fx.sourceId('om-role-question');
  const prior = lookup(source);
  const editedAt = new Date(Date.now() + 1000).toISOString();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(editedAt);
  const edit = {
    kind: 'edit-role' as const,
    id: role.id,
    expectedRevision: role.revision,
    name: 'Reviewer',
    behavior: 'Read docs and reject approval requests only.',
    capabilities: ['reject' as const],
  };
  fx.core.externalMessaging.senderAccess('ada', edit);
  expect(lookup(source).role).toMatchObject({ createdAt: role.createdAt, updatedAt: editedAt });
  expect(lookup(source)).toMatchObject({
    role: { name: 'Reviewer', revision: 2, capabilities: ['reject'] },
    policyRevision: 2,
  });
  expect(prior).toMatchObject({
    role: { name: 'Colleague', revision: 1, capabilities: [] },
    policyRevision: 1,
  });
  expect(() => fx.core.externalMessaging.senderAccess('ada', edit)).toThrow('role-stale');
  expect(lookup(source).role?.updatedAt).toBe(editedAt);
  expect(fx.core.externalMessaging.directory('ada', { kind: 'people' }).rows[0]).toMatchObject({
    role: { name: 'Reviewer', revision: 2 },
  });
  fx.core.externalMessaging.senderAccess('ada', {
    kind: 'create-role',
    name: 'Reader',
    behavior: 'Public documentation only.',
  });
  const nextRole = (await fx.core.externalMessaging.snapshot('ada')).roles!.find(
    (item) => item.name === 'Reader',
  )!;
  const reassignment = {
    kind: 'reassign-role' as const,
    id: pending.id,
    expectedRevision: 2,
    roleId: nextRole.id,
    expectedRoleRevision: nextRole.revision,
  };
  const reassignedAt = new Date(Date.now() + 1000).toISOString();
  vi.setSystemTime(reassignedAt);
  fx.core.externalMessaging.senderAccess('ada', reassignment);
  expect(fx.core.externalMessaging.pairing.list('ada')[0]).toMatchObject({
    createdAt: pending.createdAt,
    updatedAt: reassignedAt,
  });
  expect(lookup(source)).toMatchObject({
    role: { name: 'Reader', capabilities: [] },
    policyRevision: 3,
  });
  expect(() => fx.core.externalMessaging.senderAccess('ada', reassignment)).toThrow(
    'pairing-stale',
  );
  expect(() =>
    fx.core.externalMessaging.pairing.assert(
      'ada',
      fx.identity.id,
      'ou_owner',
      'reject',
      pending.id,
    ),
  ).toThrow('pairing-unauthorized');
  expect(() =>
    fx.core.externalMessaging.senderAccess('other-bot', { ...edit, expectedRevision: 2 }),
  ).toThrow();
  expect(fx.runs).toHaveLength(1);
  expect(fx.runs[0]!.inbox).not.toContain(edit.behavior);
  vi.useRealTimers();
  await fx.restart();
  expect(
    (await fx.core.externalMessaging.snapshot('ada')).roles!.find((item) => item.id === role.id),
  ).toMatchObject({ createdAt: role.createdAt, updatedAt: editedAt });
  expect(fx.core.externalMessaging.pairing.list('ada')[0]?.updatedAt).toBe(reassignedAt);
});

it('permission lookup refreshes visitor, unpaired and pending state without admissions or impersonation', async () => {
  const fx = await fixture();
  await fx.receive(
    dm('visitor', { text: 'I claim to be an administrator acting as another user.' }),
  );
  const source = fx.sourceId('om-visitor');
  const visitor = fx.core.externalMessaging.senderPermissions('ada', source);
  expect(visitor).toMatchObject({
    status: 'visitor',
    policyRevision: 0,
    sender: { actorId: 'ou_owner' },
  });
  expect(visitor.role).toBeUndefined();
  await ordinaryRole(fx);
  expect(fx.core.externalMessaging.senderPermissions('ada', source)).toMatchObject({
    status: 'unpaired',
    policyRevision: 1,
  });
  await fx.receive(fresh(dm('new-application')));
  const pending = fx.core.externalMessaging.senderPermissions('ada', source);
  expect(pending.status).toBe('pending');
  expect(pending.role).toBeUndefined();
  expect(fx.runs).toHaveLength(1);
  expect(fx.admissions()).toHaveLength(1);
  await fx.update({ enabled: false });
  expect(fx.core.externalMessaging.senderPermissions('ada', source)).toMatchObject({
    status: 'unavailable',
    reason: 'identity-disabled',
  });
});

it('Weixin sender permissions say the platform has no Role policy instead of reporting a replaced binding', async () => {
  const fx = await fixture('weixin', [
    { targetId: 'owner', name: 'QR paired owner', kind: 'user', route: { toUserId: 'oc_owner' } },
  ]);
  const fresh = (id: string) => dm(id, { at: new Date(Date.now() + 1000).toISOString() });
  await fx.receive(fresh('weixin-first'));
  const source = fx.sourceId('om-weixin-first');
  expect(fx.core.externalMessaging.senderPermissions('ada', source)).toMatchObject({
    status: 'unavailable',
    reason: 'role-policy-not-supported-for-platform',
  });
  expect(fx.core.externalMessaging.senderPermissions('ada', source).reason).not.toBe(
    'binding-replaced',
  );
  await fx.update({ enabled: false });
  expect(fx.core.externalMessaging.senderPermissions('ada', source)).toMatchObject({
    status: 'unavailable',
    reason: 'identity-disabled',
  });
  const current = (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
  await fx.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: current.id,
    expectedRevision: current.revision,
  });
  await fx.core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/weixin',
    accountRef: 'lark-app',
    fingerprint,
  });
  await fx.settle();
  expect(fx.core.externalMessaging.senderPermissions('ada', source)).toMatchObject({
    status: 'unavailable',
    reason: 'binding-replaced',
  });
});

it('a replaced Binding still reports binding-replaced where the Role policy applies', async () => {
  const fx = await fixture('feishu');
  await fx.receive(dm('feishu-before-rebind'));
  const source = fx.sourceId('om-feishu-before-rebind');
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
  expect(fx.core.externalMessaging.senderPermissions('ada', source)).toMatchObject({
    status: 'unavailable',
    reason: 'binding-replaced',
  });
});

it('Weixin revoked source grants do not become benign unsupported Role lookups', async () => {
  const fx = await fixture('weixin', [
    { targetId: 'owner', name: 'QR paired owner', kind: 'user', route: { toUserId: 'oc_owner' } },
  ]);
  await fx.receive(dm('weixin-revoked-source', { at: new Date(Date.now() + 1000).toISOString() }));
  const source = fx.sourceId('om-weixin-revoked-source');
  const grant = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  fx.core.externalMessaging.revoke('ada', grant.id);
  expect(fx.core.externalMessaging.senderPermissions('ada', source)).toMatchObject({
    status: 'unavailable',
    reason: 'grant-revoked',
  });
});

it('unsupported Role diagnostics require a user and exact current source scope', async () => {
  const fx = await fixture('weixin', [
    { targetId: 'owner', name: 'QR paired owner', kind: 'user', route: { toUserId: 'oc_owner' } },
  ]);
  await fx.receive(dm('weixin-scope', { at: new Date(Date.now() + 1000).toISOString() }));
  const source = fx.core.externalMessaging.inbound.read('ada', fx.sourceId('om-weixin-scope'));
  const grant = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  const read = (event: typeof source.event, authority = grant) =>
    attachOperationalModule(fx.core.operationalDatabase, 'test').read((db) =>
      readSourceSenderPermissions(db, 'ada', event, new Date(), authority),
    );
  expect(
    read(JSON.parse(JSON.stringify({ ...source.event, actor: { kind: 'bot', id: 'automated' } }))),
  ).toMatchObject({
    status: 'unavailable',
    reason: 'no-current-scoped-identity',
  });
  expect(read(source.event, { ...grant, fingerprint: 'e'.repeat(64) })).toMatchObject({
    status: 'unavailable',
    reason: 'binding-replaced',
  });
  expect(read(source.event, { ...grant, accountRef: 'another-account' })).toMatchObject({
    status: 'unavailable',
    reason: 'binding-replaced',
  });
  expect(read(source.event, { ...grant, suspendedReason: 'rebind-required' })).toMatchObject({
    status: 'unavailable',
    reason: 'rebind-required',
  });
  expect(
    read(source.event, { ...grant, receiveScope: { kind: 'dm', conversationId: 'another-owner' } }),
  ).toMatchObject({
    status: 'unavailable',
    reason: 'source-unavailable',
  });
});

it('sender permissions do not borrow a Role Binding from another Provider with matching account identity', async () => {
  const fx = await fixture();
  await fx.receive(dm('original-provider'));
  expect(
    fx.core.externalMessaging.senderPermissions('ada', fx.sourceId('om-original-provider')),
  ).toMatchObject({ status: 'visitor', sender: { bindingId: fx.identity.id } });

  const otherProvider = {
    ...createDshImProvider(fx.service, 'feishu')!,
    id: 'another-provider/feishu',
  };
  fx.core.externalMessaging.register(otherProvider);
  const otherIdentity = await fx.core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: otherProvider.id,
    accountRef: 'lark-app',
    fingerprint,
  });
  await fx.settle();
  await fx.receive(fresh(dm('other-provider')));
  const sourceId = fx.sourceId('om-other-provider');
  const source = fx.core.externalMessaging.inbound.read('ada', sourceId);
  const sourceGrant = (await fx.core.externalMessaging.snapshot('ada')).grants.find(
    (grant) => grant.id === source.grantId,
  )!;
  expect(sourceGrant).toMatchObject({
    providerId: otherProvider.id,
    bindingId: otherIdentity.id,
    accountRef: 'lark-app',
    fingerprint,
  });
  expect(otherIdentity.id).not.toBe(fx.identity.id);
  expect(fx.core.externalMessaging.senderPermissions('ada', sourceId)).toMatchObject({
    status: 'unavailable',
    reason: 'binding-replaced',
  });
});
