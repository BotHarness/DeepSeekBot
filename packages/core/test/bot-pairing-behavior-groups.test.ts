import { afterEach, expect, it } from 'vitest';
import { changeSenderAccess, externalUserRoles } from '../src/messaging/sender-access.js';
import { externalPermissionGroups } from '../src/messaging/permission-groups.js';
import { behaviorPermissions } from '../src/messaging/behavior-permissions.js';
import { readSenderPermissions } from '../src/messaging/sender-access.js';
import { owners, cores, event, fixture } from './support/bot-pairing.js';

afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
  for (const owner of owners.splice(0)) owner.close();
});

function behaviorFixture() {
  const f = fixture();
  const change = (input: Parameters<typeof changeSenderAccess>[2], botSlug = 'ada') => {
    try {
      f.db.transaction((db) => changeSenderAccess(db, botSlug, input));
    } catch (error) {
      if (error instanceof Error && error.cause instanceof Error) throw error.cause;
      throw error;
    }
  };
  change({ kind: 'create-role', name: 'Member', behavior: 'Answer product questions.' });
  const role = f.db.read((db) => externalUserRoles(db, 'ada')[0]!);
  const request = f.pairing.request('binding', event(), 'conversation');
  f.pairing.review('ada', {
    kind: 'approve',
    id: request.id,
    expectedRevision: 1,
    roleId: role.id,
    expectedRoleRevision: role.revision,
  });
  for (const name of ['Public answers', 'Private answers'])
    change({ kind: 'create-behavior-permission', name, behavior: `Provide ${name}.` });
  const items = () => f.db.read((db) => behaviorPermissions(db, 'ada'));
  const groups = () => f.db.read((db) => externalPermissionGroups(db, 'ada'));
  const revisions = () => Object.fromEntries(items().map((item) => [item.id, item.revision]));
  return { f, change, request, items, groups, revisions };
}

it('declared exclusion refuses new memberships and Deny-removal mutations without partial writes', () => {
  const { f, change, request, items, groups, revisions } = behaviorFixture();
  const [a, b] = items();
  change({
    kind: 'edit-behavior-permission',
    id: a!.id,
    expectedRevision: a!.revision,
    name: a!.name,
    behavior: a!.behavior,
    excludes: [b!.id],
    expectedExcludedRevisions: { [b!.id]: b!.revision },
  });
  const create = (name: string, allow: string[], deny: string[], memberIds = [request.id]) =>
    change({
      kind: 'create-group',
      bindingId: 'binding',
      name,
      allow: [],
      deny: [],
      memberIds,
      behaviorAllow: allow,
      behaviorDeny: deny,
      expectedBehaviorRevisions: revisions(),
    });
  expect(() => create('Ambiguous empty group', [a!.id, b!.id], [], [])).toThrow(
    'behavior-permission-conflict',
  );
  create('Public', [a!.id], []);
  const publicPolicy = f.db.read((db) => readSenderPermissions(db, 'ada', event(), new Date()));
  expect(publicPolicy.effectivePermissions?.behaviorPermissions).toMatchObject([
    { id: a!.id, effect: 'allow', conflict: false },
  ]);
  expect(publicPolicy.effectivePermissions?.behaviorPermissions?.[0]).not.toHaveProperty(
    'excludes',
  );
  expect(items()[0]).toMatchObject({ excludes: [b!.id] });
  create('Private', [b!.id], [], []);
  const edit = (name: string, memberIds: string[], behaviorDeny: string[]) => {
    const group = groups().find((g) => g.name === name)!;
    change({
      kind: 'edit-group',
      id: group.id,
      expectedRevision: group.revision,
      name,
      allow: [],
      deny: [],
      memberIds,
      behaviorAllow: group.behaviorAllow,
      behaviorDeny,
      expectedBehaviorRevisions: revisions(),
    });
  };
  expect(() => edit('Private', [request.id], [])).toThrow('behavior-permission-conflict');
  expect(groups().find((g) => g.name === 'Private')).toMatchObject({ memberIds: [], revision: 1 });
  create('Deny public', [], [a!.id]);
  edit('Private', [request.id], []);
  const deny = groups().find((g) => g.name === 'Deny public')!;
  expect(() =>
    change({ kind: 'delete-group', id: deny.id, expectedRevision: deny.revision }),
  ).toThrow('behavior-permission-conflict');
  expect(() => edit('Deny public', [], [a!.id])).toThrow('behavior-permission-conflict');
  expect(groups()).toHaveLength(3);
  const current = f.db.read((db) => readSenderPermissions(db, 'ada', event(), new Date()));
  expect(current.effectivePermissions).toMatchObject({
    capabilities: [],
    delegableCapabilities: [],
  });
  expect(current.effectivePermissions?.behaviorPermissions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: a!.id, effect: 'deny' }),
      expect.objectContaining({ id: b!.id, effect: 'allow' }),
    ]),
  );
  edit('Private', [], []);
  change({ kind: 'delete-group', id: deny.id, expectedRevision: deny.revision });
  expect(groups()).toHaveLength(2);
});

it('incompatible item edits are atomic; bilateral exclusions preserve revisions and restart semantics', () => {
  const { f, change, request, items, groups, revisions } = behaviorFixture();
  const [a, b] = items();
  for (const item of [a!, b!])
    change({
      kind: 'create-group',
      bindingId: 'binding',
      name: item.name,
      allow: [],
      deny: [],
      memberIds: [request.id],
      behaviorAllow: [item.id],
      expectedBehaviorRevisions: revisions(),
    });
  const exclude = {
    kind: 'edit-behavior-permission' as const,
    id: a!.id,
    expectedRevision: a!.revision,
    name: a!.name,
    behavior: a!.behavior,
    excludes: [b!.id],
    expectedExcludedRevisions: { [b!.id]: b!.revision },
  };
  expect(() => change(exclude)).toThrow('behavior-permission-conflict');
  expect(items()).toEqual([a, b]);
  const privateGroup = groups().find((g) => g.name === b!.name)!;
  change({
    kind: 'edit-group',
    id: privateGroup.id,
    expectedRevision: privateGroup.revision,
    name: privateGroup.name,
    allow: [],
    deny: [],
    memberIds: [],
    behaviorAllow: [b!.id],
    expectedBehaviorRevisions: revisions(),
  });
  change(exclude);
  const updatedA = items().find((i) => i.id === a!.id)!;
  const updatedB = items().find((i) => i.id === b!.id)!;
  expect(updatedA).toMatchObject({ excludes: [b!.id], revision: 2 });
  expect(updatedB).toMatchObject({ excludes: [a!.id], revision: 2 });
  expect(() =>
    change({ ...exclude, expectedRevision: 2, expectedExcludedRevisions: { [b!.id]: 1 } }),
  ).toThrow('behavior-permission-stale');
  f.owner.close();
  const recovered = f.mount();
  expect(recovered.db.read((db) => behaviorPermissions(db, 'ada'))).toEqual([updatedA, updatedB]);
  recovered.db.transaction((db) =>
    changeSenderAccess(db, 'ada', {
      kind: 'edit-behavior-permission',
      id: b!.id,
      expectedRevision: 2,
      name: b!.name,
      behavior: b!.behavior,
      excludes: [],
      expectedExcludedRevisions: { [a!.id]: 2 },
    }),
  );
  expect(recovered.db.read((db) => behaviorPermissions(db, 'ada'))).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: a!.id, revision: 3, excludes: [] }),
      expect.objectContaining({ id: b!.id, revision: 3, excludes: [] }),
    ]),
  );
});

it('exclusion targets stay Bot-scoped and deletion cannot leave links to an absent item', () => {
  const { f, change, items } = behaviorFixture();
  const [a, b] = items();
  change({ kind: 'create-behavior-permission', name: 'Other', behavior: 'Other policy.' }, 'other');
  const other = f.db.read((db) => behaviorPermissions(db, 'other')[0]!);
  const edit = {
    kind: 'edit-behavior-permission' as const,
    id: a!.id,
    expectedRevision: 1,
    name: a!.name,
    behavior: a!.behavior,
  };
  expect(() =>
    change({ ...edit, excludes: [other.id], expectedExcludedRevisions: { [other.id]: 1 } }),
  ).toThrow('behavior-permission-stale');
  expect(() =>
    change({ ...edit, excludes: [a!.id], expectedExcludedRevisions: { [a!.id]: 1 } }),
  ).toThrow('behavior-permission-stale');
  change({ ...edit, excludes: [b!.id], expectedExcludedRevisions: { [b!.id]: 1 } });
  change({ kind: 'delete-behavior-permission', id: b!.id, expectedRevision: 2 });
  expect(items()).toEqual([expect.objectContaining({ id: a!.id, revision: 3, excludes: [] })]);
  expect(f.db.read((db) => behaviorPermissions(db, 'other'))).toEqual([other]);
});

it('disabled-Binding approved memberships retain configuration checks, while permanently revoked membership does not block item editing', () => {
  const { f, change, request, items, revisions } = behaviorFixture();
  const [a, b] = items();
  for (const item of [a!, b!])
    change({
      kind: 'create-group',
      bindingId: 'binding',
      name: item.name,
      allow: [],
      deny: [],
      memberIds: [request.id],
      behaviorAllow: [item.id],
      expectedBehaviorRevisions: revisions(),
    });
  f.db.transaction((db) =>
    db.prepare('UPDATE messaging_bindings SET enabled = 0 WHERE id = ?').run('binding'),
  );
  expect(f.pairing.list('ada')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: request.id,
        status: 'unavailable',
        roleId: expect.any(String),
      }),
    ]),
  );
  const exclusion = {
    kind: 'edit-behavior-permission' as const,
    id: a!.id,
    expectedRevision: 1,
    name: a!.name,
    behavior: a!.behavior,
    excludes: [b!.id],
    expectedExcludedRevisions: { [b!.id]: 1 },
  };
  expect(() => change(exclusion)).toThrow('behavior-permission-conflict');
  expect(items()).toEqual([a, b]);
  f.db.transaction((db) =>
    db
      .prepare('UPDATE messaging_bindings SET revoked_at = ? WHERE id = ?')
      .run(new Date().toISOString(), 'binding'),
  );
  change(exclusion);
  expect(f.pairing.list('ada')[0]).toMatchObject({ status: 'revoked' });
  expect(items()).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: a!.id, excludes: [b!.id] })]),
  );
  expect(
    f.db.read((db) => readSenderPermissions(db, 'ada', event(), new Date())).effectivePermissions,
  ).toBeUndefined();
});

it('shared behavior items resolve current group sources, Deny conflicts and revisions without granting management authority', () => {
  const f = fixture();
  const change = (input: Parameters<typeof changeSenderAccess>[2]) =>
    f.db.transaction((db) => changeSenderAccess(db, 'ada', input));
  change({
    kind: 'create-role',
    name: 'Member',
    behavior: 'Answer briefly. Do not reveal private data.',
  });
  const role = f.db.read((db) => externalUserRoles(db, 'ada')[0]!);
  const request = f.pairing.request('binding', event(), 'conversation');
  f.pairing.review('ada', {
    kind: 'approve',
    id: request.id,
    expectedRevision: 1,
    roleId: role.id,
    expectedRoleRevision: 1,
  });
  change({
    kind: 'create-behavior-permission',
    name: 'Pricing',
    behavior: 'Answer product pricing questions.',
  });
  const item = f.db.read((db) => behaviorPermissions(db, 'ada')[0]!);
  for (const name of ['Sales', 'Support'])
    change({
      kind: 'create-group',
      bindingId: 'binding',
      name,
      allow: [],
      deny: [],
      memberIds: [request.id],
      behaviorAllow: [item.id],
      behaviorDeny: [],
      expectedBehaviorRevisions: { [item.id]: item.revision },
    });
  const groups = () => f.db.read((db) => externalPermissionGroups(db, 'ada'));
  const permissions = () =>
    f.db.read((db) => readSenderPermissions(db, 'ada', event(), new Date()));
  expect(permissions()).toMatchObject({
    status: 'paired',
    role: { id: role.id, behavior: role.behavior },
    effectivePermissions: {
      capabilities: [],
      delegableCapabilities: [],
      behaviorPermissions: [
        {
          id: item.id,
          effect: 'allow',
          conflict: false,
          sources: [{ name: 'Sales' }, { name: 'Support' }],
        },
      ],
    },
  });
  expect(permissions().effectivePermissions?.behaviorPermissions).toHaveLength(1);
  expect(() => f.pairing.assert('ada', 'binding', 'ou_alice', 'approve')).toThrow(
    'pairing-unauthorized',
  );
  const support = groups()[1]!;
  change({
    kind: 'edit-group',
    id: support.id,
    expectedRevision: support.revision,
    name: support.name,
    allow: [],
    deny: [],
    memberIds: [request.id],
    behaviorAllow: [],
    behaviorDeny: [item.id],
    expectedBehaviorRevisions: { [item.id]: 1 },
  });
  expect(permissions().effectivePermissions?.behaviorPermissions).toMatchObject([
    {
      effect: 'deny',
      conflict: true,
      sources: [{ effect: 'allow' }, { effect: 'deny', revision: 2 }],
    },
  ]);
  f.owner.close();
  const restarted = f.mount();
  expect(
    restarted.db.read((db) => readSenderPermissions(db, 'ada', event(), new Date()))
      .effectivePermissions?.behaviorPermissions,
  ).toMatchObject([{ id: item.id, effect: 'deny', conflict: true }]);
  restarted.db.transaction((db) =>
    changeSenderAccess(db, 'ada', {
      kind: 'edit-group',
      id: support.id,
      expectedRevision: 2,
      name: support.name,
      allow: [],
      deny: [],
      memberIds: [],
      behaviorAllow: [],
      behaviorDeny: [item.id],
      expectedBehaviorRevisions: { [item.id]: 1 },
    }),
  );
  expect(
    restarted.db.read((db) => readSenderPermissions(db, 'ada', event(), new Date()))
      .effectivePermissions?.behaviorPermissions,
  ).toMatchObject([
    { id: item.id, effect: 'allow', conflict: false, sources: [{ name: 'Sales' }] },
  ]);
  expect(
    restarted.db.read((db) => readSenderPermissions(db, 'ada', event(), new Date()))
      .effectivePermissions?.behaviorPermissions?.[0]?.sources,
  ).toHaveLength(1);
  restarted.owner.close();
});

it('behavior item edits fence stale selections, scope references and in-use deletion; revoke/re-pair cannot inherit groups', () => {
  const f = fixture();
  const change = (input: Parameters<typeof changeSenderAccess>[2]) => {
    try {
      f.db.transaction((db) => changeSenderAccess(db, 'ada', input));
    } catch (error) {
      if (error instanceof Error && error.cause instanceof Error) throw error.cause;
      throw error;
    }
  };
  change({ kind: 'create-role', name: 'Member', behavior: 'Answer briefly.' });
  const role = f.db.read((db) => externalUserRoles(db, 'ada')[0]!);
  const request = f.pairing.request('binding', event(), 'conversation');
  f.pairing.review('ada', {
    kind: 'approve',
    id: request.id,
    expectedRevision: 1,
    roleId: role.id,
    expectedRoleRevision: 1,
  });
  change({
    kind: 'create-behavior-permission',
    name: 'Pricing',
    behavior: 'Answer pricing questions.',
  });
  const item = f.db.read((db) => behaviorPermissions(db, 'ada')[0]!);
  const group = {
    kind: 'create-group' as const,
    bindingId: 'binding',
    name: 'Sales',
    allow: [],
    deny: [],
    memberIds: [request.id],
    behaviorAllow: [item.id],
    behaviorDeny: [],
  };
  f.db.transaction((db) =>
    changeSenderAccess(db, 'other-bot', {
      kind: 'create-behavior-permission',
      name: 'Other pricing',
      behavior: 'Answer prices.',
    }),
  );
  const otherItem = f.db.read((db) => behaviorPermissions(db, 'other-bot')[0]!);
  expect(() =>
    change({
      ...group,
      behaviorAllow: [otherItem.id],
      expectedBehaviorRevisions: { [otherItem.id]: 1 },
    }),
  ).toThrow('behavior-permission-stale');
  change({
    kind: 'edit-behavior-permission',
    id: item.id,
    expectedRevision: 1,
    name: 'Pricing',
    behavior: 'Answer public pricing questions only.',
  });
  expect(() => change({ ...group, expectedBehaviorRevisions: { [item.id]: 1 } })).toThrow(
    'behavior-permission-stale',
  );
  expect(() =>
    change({
      ...group,
      behaviorAllow: ['00000000-0000-4000-8000-000000000001'],
      expectedBehaviorRevisions: {},
    }),
  ).toThrow('behavior-permission-stale');
  change({ ...group, expectedBehaviorRevisions: { [item.id]: 2 } });
  expect(
    f.db.read((db) => readSenderPermissions(db, 'ada', event(), new Date())).effectivePermissions
      ?.behaviorPermissions,
  ).toMatchObject([{ revision: 2, behavior: 'Answer public pricing questions only.' }]);
  expect(() =>
    change({ kind: 'delete-behavior-permission', id: item.id, expectedRevision: 2 }),
  ).toThrow('behavior-permission-in-use');
  expect(() =>
    change({
      kind: 'edit-behavior-permission',
      id: item.id,
      expectedRevision: 1,
      name: 'Pricing',
      behavior: 'Stale replacement.',
    }),
  ).toThrow('behavior-permission-stale');
  f.pairing.review('ada', { kind: 'revoke', id: request.id, expectedRevision: 2 });
  expect(
    f.db.read((db) => readSenderPermissions(db, 'ada', event(), new Date())).effectivePermissions,
  ).toBeUndefined();
  const fresh = f.pairing.request('binding', event(), 'conversation');
  f.pairing.review('ada', {
    kind: 'approve',
    id: fresh.id,
    expectedRevision: fresh.revision,
    roleId: role.id,
    expectedRoleRevision: 1,
  });
  expect(
    f.db.read((db) => readSenderPermissions(db, 'ada', event(), new Date())).effectivePermissions
      ?.behaviorPermissions,
  ).toBeUndefined();
  const savedGroup = f.db.read((db) => externalPermissionGroups(db, 'ada')[0]!);
  change({ kind: 'delete-group', id: savedGroup.id, expectedRevision: savedGroup.revision });
  change({ kind: 'delete-behavior-permission', id: item.id, expectedRevision: 2 });
  expect(f.db.read((db) => behaviorPermissions(db, 'ada'))).toEqual([]);
});

it('continuous groups combine sources, deny wins, and membership removal preserves independent grants across restart', () => {
  const f = fixture();
  const change = (input: Parameters<typeof changeSenderAccess>[2]) => {
    try {
      f.db.transaction((db) => changeSenderAccess(db, 'ada', input));
    } catch (error) {
      if (error instanceof Error && error.cause instanceof Error) throw error.cause;
      throw error;
    }
  };
  change({ kind: 'create-role', name: 'Ordinary', behavior: 'Answer ordinary questions.' });
  const role = f.db.read((db) => externalUserRoles(db, 'ada')[0]!);
  const request = f.pairing.request('binding', event(), 'conversation');
  f.pairing.review('ada', {
    kind: 'approve',
    id: request.id,
    expectedRevision: 1,
    roleId: role.id,
    expectedRoleRevision: 1,
  });
  const assert = (capability: 'approve' | 'reject') =>
    f.pairing.assert('ada', 'binding', 'ou_alice', capability, request.id);
  expect(() => assert('approve')).toThrow('pairing-unauthorized');
  change({
    kind: 'create-group',
    bindingId: 'binding',
    name: 'Reviewers',
    allow: ['approve'],
    deny: [],
    memberIds: [request.id],
  });
  change({
    kind: 'create-group',
    bindingId: 'binding',
    name: 'Review exceptions',
    allow: ['reject'],
    deny: ['approve'],
    memberIds: [request.id],
  });
  const groups = () => f.db.read((db) => externalPermissionGroups(db, 'ada'));
  expect(() => assert('approve')).toThrow('pairing-unauthorized');
  expect(assert('reject').effectivePermissions).toMatchObject({
    capabilities: ['reject'],
    deniedCapabilities: ['approve'],
    permissionSources: [
      { kind: 'role' },
      { kind: 'group', name: 'Reviewers' },
      { kind: 'group', name: 'Review exceptions' },
    ],
  });
  const deny = groups()[1]!;
  change({
    kind: 'edit-group',
    id: deny.id,
    expectedRevision: deny.revision,
    name: deny.name,
    allow: ['reject'],
    deny: [],
    memberIds: [],
  });
  expect(assert('approve').capabilities).toEqual(['approve']);
  expect(() => assert('reject')).toThrow('pairing-unauthorized');
  change({
    kind: 'person-permissions',
    id: request.id,
    expectedRevision: 2,
    allow: ['reject'],
    deny: ['approve'],
  });
  expect(() => assert('approve')).toThrow('pairing-unauthorized');
  expect(assert('reject').capabilities).toEqual(['reject']);
  expect(() =>
    change({
      kind: 'person-permissions',
      id: request.id,
      expectedRevision: 2,
      allow: ['approve'],
      deny: [],
    }),
  ).toThrow('pairing-stale');
  expect(() =>
    change({
      kind: 'edit-group',
      id: deny.id,
      expectedRevision: deny.revision,
      name: deny.name,
      allow: ['approve'],
      deny: [],
      memberIds: [],
    }),
  ).toThrow('permission-group-stale');
  const allow = groups()[0]!;
  change({ kind: 'delete-group', id: allow.id, expectedRevision: allow.revision });
  expect(assert('reject').capabilities).toEqual(['reject']);
  f.owner.close();
  const restarted = f.mount();
  expect(
    restarted.pairing
      .assert('ada', 'binding', 'ou_alice', 'reject', request.id)
      .effectivePermissions?.permissionSources.map((source) => source.kind),
  ).toEqual(['role', 'person']);
});

it('groups cannot grant chat, cross scopes or transfer old membership/person exceptions to a new pairing', () => {
  const f = fixture();
  const change = (input: Parameters<typeof changeSenderAccess>[2]) => {
    try {
      f.db.transaction((db) => changeSenderAccess(db, 'ada', input));
    } catch (error) {
      if (error instanceof Error && error.cause instanceof Error) throw error.cause;
      throw error;
    }
  };
  change({ kind: 'create-role', name: 'Ordinary', behavior: 'Answer ordinary questions.' });
  const role = f.db.read((db) => externalUserRoles(db, 'ada')[0]!);
  const pending = f.pairing.request('binding', event(), 'conversation');
  expect(() =>
    change({
      kind: 'create-group',
      bindingId: 'binding',
      name: 'Reviewers',
      allow: ['approve'],
      deny: [],
      memberIds: [pending.id],
    }),
  ).toThrow('pairing-stale');
  const approved = f.pairing.review('ada', {
    kind: 'approve',
    id: pending.id,
    expectedRevision: 1,
    roleId: role.id,
    expectedRoleRevision: 1,
  });
  change({
    kind: 'create-group',
    bindingId: 'binding',
    name: 'Reviewers',
    allow: ['approve'],
    deny: [],
    memberIds: [pending.id],
  });
  change({
    kind: 'person-permissions',
    id: pending.id,
    expectedRevision: approved.revision,
    allow: ['reject'],
    deny: [],
  });
  expect(() =>
    f.pairing.assert('another-bot', 'binding', 'ou_alice', 'approve', pending.id),
  ).toThrow('pairing-unauthorized');
  expect(() => f.pairing.assert('ada', 'binding', 'ou_other', 'approve', pending.id)).toThrow(
    'pairing-unauthorized',
  );
  f.db.transaction((db) =>
    db.prepare('UPDATE messaging_bindings SET enabled = 0 WHERE id = ?').run('binding'),
  );
  expect(() => f.pairing.assert('ada', 'binding', 'ou_alice', 'approve', pending.id)).toThrow(
    'pairing-unauthorized',
  );
  f.db.transaction((db) =>
    db.prepare('UPDATE messaging_bindings SET enabled = 1 WHERE id = ?').run('binding'),
  );
  f.pairing.review('ada', { kind: 'revoke', id: pending.id, expectedRevision: 3 });
  const fresh = f.pairing.request('binding', event('ou_alice', 'fresh-message'), 'conversation');
  expect(fresh.id).not.toBe(pending.id);
  f.pairing.review('ada', {
    kind: 'approve',
    id: fresh.id,
    expectedRevision: 1,
    roleId: role.id,
    expectedRoleRevision: 1,
  });
  expect(() => f.pairing.assert('ada', 'binding', 'ou_alice', 'approve', fresh.id)).toThrow(
    'pairing-unauthorized',
  );
  expect(() => f.pairing.assert('ada', 'binding', 'ou_alice', 'reject', fresh.id)).toThrow(
    'pairing-unauthorized',
  );
  expect(
    f.pairing
      .list('ada')
      .find((pair) => pair.id === fresh.id)
      ?.effectivePermissions?.permissionSources.map((source) => source.kind),
  ).toEqual(['role']);
});
