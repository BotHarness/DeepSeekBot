import { afterEach, expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createOutboundMessaging } from '../src/messaging/outbound.js';
import { createBotPairing } from '../src/messaging/pairing.js';
import { readSenderPermissions, senderAdmission } from '../src/messaging/permissions/index.js';
import { cleanup, fixture } from './messaging-default-traffic-fixtures.js';
import { directMessage } from './messaging-pairing-text-fixtures.js';

afterEach(cleanup);

const actor = 'U12345';
const peer = 'U67890';
const workspace = 'T12345';

async function setup() {
  const { core, identity } = await fixture('slack', [], workspace);
  const methods = createBridgeMethods(owner, { ...core });
  const messaging = core.externalMessaging;
  const database = attachOperationalModule(core.operationalDatabase, 'messaging-test');
  const addBot = (slug: string, workspaceId = workspace) => {
    expect(core.registry.create({ slug, displayName: slug }).ok).toBe(true);
    const fingerprint = slug.padEnd(64, 'f');
    const bindingId = crypto.randomUUID();
    database.transaction((db) =>
      db
        .prepare(`INSERT INTO messaging_bindings
        (id, bot_slug, provider_id, platform, account_ref, fingerprint, created_at, display_name, contact_workspace_id)
        VALUES (?, ?, 'dsh-im/slack', 'slack', ?, ?, ?, ?, ?)`)
        .run(bindingId, slug, slug, fingerprint, new Date().toISOString(), slug, workspaceId),
    );
    return {
      bindingId,
      slug,
      event(actorId = actor) {
        return {
          ...directMessage('slack', 'fresh', actorId),
          botId: slug,
          fingerprint,
          at: new Date(Date.now() + 1000).toISOString(),
        };
      },
    };
  };
  const access = (slug: string, bindingId: string, actorId = actor) =>
    methods.externalContactAccess({ slug, bindingId, actorId });

  const restrict = async (slug: string) => {
    const current = (await messaging.snapshot(slug, 'saved')).senderPolicy;
    expect(
      await methods.senderAccess({
        slug,
        input: { kind: 'policy', restricted: true, expectedRevision: current?.revision ?? 0 },
      }),
    ).toMatchObject({ ok: true });
  };

  return { core, methods, messaging, database, identity, addBot, access, restrict };
}

it('keeps new Bots and new external contacts open by default and leaves unrelated role edits local', async () => {
  const { methods, addBot, access, restrict, messaging, identity, database } = await setup();
  await methods.senderAccess({
    slug: 'ada',
    input: { kind: 'create-role', name: 'Support', behavior: 'Answer questions.' },
  });
  const list = await methods.externalRoles();
  if (!list.ok) throw new Error(list.error.code);
  const [role] = list.value.roles;
  if (!role) throw new Error('Expected the created role');
  expect(role).toMatchObject({
    botScope: { kind: 'only', botSlugs: ['ada'] },
    capabilities: [],
    deniedCapabilities: [],
    policy: [],
  });
  const request = messaging.pairing.request(
    identity.id,
    directMessage('slack', 'request', actor),
    'conversation',
  );
  expect(
    await methods.pairingReview({
      slug: 'ada',
      input: {
        kind: 'approve',
        id: request.id,
        expectedRevision: request.revision,
        roleId: role.id,
        expectedRoleRevision: role.revision,
      },
    }),
  ).toMatchObject({ ok: true });

  const bea = addBot('bea');
  expect(await access(bea.slug, bea.bindingId, peer)).toMatchObject({
    ok: true,
    value: { status: 'visitor', canSpeak: true, roleIds: [], capabilities: [] },
  });
  expect(database.read((db) => senderAdmission(db, bea.slug, bea.event(peer)))).toBe('wake');
  expect(
    await methods.externalRoleChange({
      kind: 'update',
      id: role.id,
      expectedRevision: role.revision,
      name: 'Support desk',
    }),
  ).toMatchObject({ ok: true, value: { role: { botScope: { kind: 'only', botSlugs: ['ada'] } } } });
  await restrict(bea.slug);
  expect(await access(bea.slug, bea.bindingId)).toMatchObject({
    ok: true,
    value: { status: 'unpaired', canSpeak: false, roleIds: [] },
  });
  expect(database.read((db) => senderAdmission(db, bea.slug, bea.event()))).toBe('refused');
});

it('merges explicitly scoped roles for the same verified Slack contact and fences review, workspace and blocks', async () => {
  const { methods, messaging, identity, addBot, access, restrict, database, core } = await setup();
  const bea = addBot('bea');
  const cy = addBot('cy', 'T99999');
  await restrict(bea.slug);
  await restrict(cy.slug);
  const raised = await methods.externalRoleChange({
    kind: 'create',
    name: 'Support',
    botScope: { kind: 'all' },
    capabilities: ['approve', 'answer', 'review-pairing'],
    delegableCapabilities: ['approve', 'review-pairing'],
    policy: [{ topic: 'Notes', text: 'Share the notes.', effect: 'allow' }],
  });
  if (!raised.ok) throw new Error(raised.error.code);
  const role = raised.value.role;
  const request = messaging.pairing.request(
    identity.id,
    directMessage('slack', 'request', actor),
    'conversation',
  );
  expect(
    await methods.pairingReview({
      slug: 'ada',
      input: {
        kind: 'approve',
        id: request.id,
        expectedRevision: request.revision,
        roleId: role.id,
        expectedRoleRevision: role.revision,
      },
    }),
  ).toMatchObject({ ok: true });
  expect(await access(bea.slug, bea.bindingId)).toMatchObject({
    ok: true,
    value: {
      status: 'paired',
      canSpeak: true,
      capabilities: ['approve', 'answer'],
      roleIds: [role.id],
    },
  });
  expect(messaging.pairing.assert(bea.slug, bea.bindingId, actor, 'answer').id).toBe(request.id);
  expect(() => messaging.pairing.assert(bea.slug, bea.bindingId, actor, 'review-pairing')).toThrow(
    'pairing-unauthorized',
  );
  expect(database.read((db) => senderAdmission(db, bea.slug, bea.event()))).toBe('wake');
  expect(await access(cy.slug, cy.bindingId)).toMatchObject({
    ok: true,
    value: { status: 'unpaired', canSpeak: false, capabilities: [], roleIds: [] },
  });
  const dana = addBot('dana');
  await restrict(dana.slug);
  expect(await access(dana.slug, dana.bindingId)).toMatchObject({
    ok: true,
    value: { status: 'paired', canSpeak: true, roleIds: [role.id] },
  });
  const ownerBot = createBridgeMethods({ ...owner, caller: 'bot' }, { ...core });
  expect(await ownerBot.externalRoles()).toMatchObject({
    ok: false,
    error: { code: 'permission-required' },
  });
  expect(
    await methods.externalRoleChange({
      kind: 'update',
      id: role.id,
      expectedRevision: role.revision + 1,
      botScope: { kind: 'only', botSlugs: [] },
    }),
  ).toMatchObject({ ok: false, error: { code: 'role-stale' } });

  const changed = await methods.externalRoleChange({
    kind: 'create',
    name: 'Support',
    botScope: { kind: 'only', botSlugs: [bea.slug] },
    deniedCapabilities: ['approve'],
    policy: [{ topic: 'Notes', text: 'Ask first.', effect: 'ask' }],
  });
  if (!changed.ok) throw new Error(changed.error.code);
  const second = changed.value.role;
  const local = messaging.pairing.request(bea.bindingId, bea.event(), 'conversation');
  expect(
    await methods.pairingReview({
      slug: bea.slug,
      input: {
        kind: 'approve',
        id: local.id,
        expectedRevision: local.revision,
        roleId: second.id,
        expectedRoleRevision: second.revision,
      },
    }),
  ).toMatchObject({ ok: true });
  expect(await access(bea.slug, bea.bindingId)).toMatchObject({
    ok: true,
    value: {
      canSpeak: true,
      capabilities: ['answer'],
      deniedCapabilities: ['approve'],
      roleIds: [second.id, role.id],
    },
  });
  expect(
    database.read((db) => readSenderPermissions(db, bea.slug, bea.event(), new Date())),
  ).toMatchObject({
    effectivePermissions: { roleRules: [{ topic: 'Notes', effect: 'ask' }] },
  });
  expect(
    await methods.externalRoleChange({
      kind: 'update',
      id: second.id,
      expectedRevision: second.revision,
      policy: [{ topic: 'Notes', text: 'Keep the notes private.', effect: 'deny' }],
    }),
  ).toMatchObject({ ok: true });
  expect(
    database.read((db) => readSenderPermissions(db, bea.slug, bea.event(), new Date())),
  ).toMatchObject({
    effectivePermissions: { roleRules: [{ topic: 'Notes', effect: 'deny' }] },
  });
  expect(
    await methods.senderAccess({
      slug: bea.slug,
      input: { kind: 'block-sender', bindingId: bea.bindingId, actorId: actor },
    }),
  ).toMatchObject({ ok: true });
  expect(await access(bea.slug, bea.bindingId)).toMatchObject({
    ok: true,
    value: { status: 'blocked', canSpeak: false, roleIds: [], capabilities: [] },
  });
  expect(database.read((db) => senderAdmission(db, bea.slug, bea.event()))).toBe('refused');
  expect(await access('ada', identity.id)).toMatchObject({
    ok: true,
    value: { status: 'paired', canSpeak: true },
  });
});

it('updates selected scope, revokes inherited authority immediately and lets only the Owner assign a multi-Bot role', async () => {
  const { methods, messaging, identity, addBot, access, restrict, database } = await setup();
  const bea = addBot('bea');
  await restrict(bea.slug);
  const created = await methods.externalRoleChange({
    kind: 'create',
    name: 'Support',
    botScope: { kind: 'only', botSlugs: ['ada', bea.slug] },
    capabilities: ['answer'],
  });
  if (!created.ok) throw new Error(created.error.code);
  const role = created.value.role;
  const reviewerRequest = messaging.pairing.request(identity.id, {
    ...directMessage('slack', 'reviewer', peer),
    text: '/pair',
  });
  messaging.pairing.review('ada', {
    id: reviewerRequest.id,
    kind: 'approve',
    expectedRevision: reviewerRequest.revision,
    capabilities: ['review-pairing', 'answer'],
    delegable: true,
  });
  const request = messaging.pairing.request(
    identity.id,
    directMessage('slack', 'request', actor),
    'conversation',
  );
  const approve = {
    kind: 'approve' as const,
    id: request.id,
    expectedRevision: request.revision,
    roleId: role.id,
    expectedRoleRevision: role.revision,
  };
  expect(() =>
    messaging.pairing.review('ada', approve, { bindingId: identity.id, actorId: peer }),
  ).toThrow('pairing-delegation-denied');
  messaging.pairing.review('ada', approve);
  expect(await access(bea.slug, bea.bindingId)).toMatchObject({
    ok: true,
    value: { status: 'paired', canSpeak: true, capabilities: ['answer'] },
  });

  expect(
    await methods.externalRoleChange({
      kind: 'update',
      id: role.id,
      expectedRevision: role.revision,
      botScope: { kind: 'only', botSlugs: ['ada'] },
    }),
  ).toMatchObject({ ok: true, value: { role: { revision: 2 } } });
  expect(await access(bea.slug, bea.bindingId)).toMatchObject({
    ok: true,
    value: { status: 'unpaired', canSpeak: false, capabilities: [] },
  });
  expect(() => messaging.pairing.assert(bea.slug, bea.bindingId, actor, 'answer')).toThrow(
    'pairing-unauthorized',
  );
  const before = await methods.externalRoleChange({
    kind: 'update',
    id: role.id,
    expectedRevision: 2,
    botScope: { kind: 'only', botSlugs: ['ada', bea.slug] },
  });
  if (!before.ok) throw new Error(before.error.code);
  const local = messaging.pairing.request(bea.bindingId, bea.event(peer), 'conversation');
  messaging.pairing.review(bea.slug, {
    kind: 'approve',
    id: local.id,
    expectedRevision: local.revision,
    roleId: role.id,
    expectedRoleRevision: before.value.role.revision,
  });

  const narrowed = await methods.externalRoleChange({
    kind: 'update',
    id: role.id,
    expectedRevision: before.value.role.revision,
    botScope: { kind: 'only', botSlugs: [bea.slug] },
  });
  if (!narrowed.ok) throw new Error(narrowed.error.code);
  expect(await access(bea.slug, bea.bindingId)).toMatchObject({
    ok: true,
    value: { status: 'unpaired', canSpeak: false, capabilities: [], roleIds: [] },
  });
  expect(database.read((db) => senderAdmission(db, bea.slug, bea.event()))).toBe('refused');
  expect(() => messaging.pairing.assert(bea.slug, bea.bindingId, actor, 'answer')).toThrow(
    'pairing-unauthorized',
  );
  expect(await access(bea.slug, bea.bindingId, peer)).toMatchObject({
    ok: true,
    value: { status: 'paired', canSpeak: true, capabilities: ['answer'], roleIds: [role.id] },
  });
  expect(messaging.pairing.assert(bea.slug, bea.bindingId, peer, 'answer').id).toBe(local.id);

  await methods.externalRoleChange({
    kind: 'update',
    id: role.id,
    expectedRevision: narrowed.value.role.revision,
    botScope: { kind: 'only', botSlugs: ['ada', bea.slug] },
  });
  expect(await access(bea.slug, bea.bindingId)).toMatchObject({
    ok: true,
    value: { status: 'paired', canSpeak: true, capabilities: ['answer'], roleIds: [role.id] },
  });
  expect(database.read((db) => senderAdmission(db, bea.slug, bea.event()))).toBe('wake');
});

it('keeps an older eligible remote approval when a later local approval shares its role', async () => {
  const { methods, identity, addBot, restrict, database } = await setup();
  const bea = addBot('bea');
  await restrict(bea.slug);
  const created = await methods.externalRoleChange({
    kind: 'create',
    name: 'Support',
    botScope: { kind: 'only', botSlugs: ['ada', bea.slug] },
  });
  if (!created.ok) throw new Error(created.error.code);
  const role = created.value.role;
  const start = Date.now();
  let time = start;
  const pairing = createBotPairing(
    database,
    () => true,
    () => new Date(time),
  );
  const approve = (slug: string, request: ReturnType<typeof pairing.request>) =>
    pairing.review(slug, {
      kind: 'approve',
      id: request.id,
      expectedRevision: request.revision,
      roleId: role.id,
      expectedRoleRevision: role.revision,
    });
  approve(
    'ada',
    pairing.request(identity.id, directMessage('slack', 'remote', actor), 'conversation'),
  );
  time += 2 * 60_000;
  approve(bea.slug, pairing.request(bea.bindingId, bea.event(), 'conversation'));

  const admissionAt = (at: number) =>
    database.read((db) =>
      senderAdmission(db, bea.slug, {
        ...bea.event(),
        messageId: 'message-between-approvals',
        reply: { ...bea.event().reply, messageId: 'message-between-approvals' },
        at: new Date(at).toISOString(),
      }),
    );
  expect(admissionAt(start - 1)).toBe('refused');
  expect(admissionAt(start + 60_000)).toBe('wake');
  expect(admissionAt(time + 1)).toBe('wake');
});

it('notifies later Bots and logs failure after committing an external role change', async () => {
  const { addBot, database } = await setup();
  addBot('bea');
  addBot('cy');
  const notified: string[] = [];
  const warnings: string[] = [];
  const messaging = createOutboundMessaging({
    database,
    isBotActive: () => true,
    recover: false,
    onAuthorizationChanged(slug) {
      notified.push(slug);
      if (notified.length === 1) throw new Error('Reconciliation failed');
    },
    warn(message) {
      warnings.push(message);
    },
  });
  try {
    const role = messaging.externalRoleChange({
      kind: 'create',
      name: 'Support',
      botScope: { kind: 'all' },
    });
    expect([...notified].sort()).toEqual(['ada', 'bea', 'cy']);
    expect(warnings.map((message) => JSON.parse(message))).toContainEqual({
      event: 'external-role-notification-failed',
      roleId: role.id,
      failures: [{ botSlug: notified[0], operation: 'authorization-change' }],
    });
    expect(messaging.externalRoles()).toEqual([role]);
  } finally {
    messaging.close();
  }
});
