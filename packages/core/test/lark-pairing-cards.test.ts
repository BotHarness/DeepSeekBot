import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type {
  MessagingInboundEvent,
  MessagingPairingAction,
  MessagingPairingCard,
} from '../src/messaging/provider.js';
import { createTempRoot } from './helpers.js';
import { attachOperationalModule } from '../src/database/owner.js';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
const fingerprint = 'a'.repeat(64);
function event(actorId: string, messageId: string, group = true): MessagingInboundEvent {
  const conversationId = group ? 'oc_group' : `oc_${actorId}`;
  return {
    version: 1,
    channel: 'feishu',
    botId: 'lark-qa',
    fingerprint,
    eventId: messageId,
    messageId,
    actor: { kind: 'user', id: actorId, name: actorId },
    conversation: { kind: group ? 'group' : 'dm', id: conversationId },
    mentions: [],
    mentionedAccount: group,
    at: new Date().toISOString(),
    text: 'restricted question 17 times 19',
    reply: { messageId, conversationId, actorId },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  };
}
async function fixture() {
  const home = createTempRoot('bh-pairing-cards-');
  let core = createCore({ dshHome: home });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.channels.getOrCreateDm('ada', 'Ada');
  let receiver: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  let uncertainSend = false;
  const deliveries: { card: MessagingPairingCard; messageId: string; conversationId: string }[] =
    [];
  const cards = vi.fn<NonNullable<DshImOutboundService['approvalCardChecked']>>(
    async (_botId, route, card, input) => {
      expect(input.beforeSend()).toBe(true);
      if (card.kind !== 'pairing') throw new Error('Unexpected native approval');
      if (!input.update && uncertainSend) throw new Error('Unknown platform outcome');
      if (input.update) {
        const previous = deliveries.find((value) => value.messageId === route.messageId);
        if (previous) previous.card = card;
        return { updated: true };
      }
      const messageId = `om_card${deliveries.length}`;
      deliveries.push({ card, messageId, conversationId: route.conversationId });
      return {
        sent: true,
        receipt: { version: 1, messageId, conversationId: route.conversationId },
      };
    },
  );
  const reply = vi.fn<NonNullable<DshImOutboundService['replyChecked']>>(async () => ({
    sent: true,
  }));
  const host: DshImOutboundService = {
    contractVersion: 1,
    approvalCardVersion: 1,
    pairingCardVersion: 1,
    listBots: async () => [{ botId: 'lark-qa', channel: 'feishu' }],
    listTargets: async () => [],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'feishu',
      connected: true,
      account: { fingerprint, name: 'Lark QA' },
      capabilities: [
        'proactive-text-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        'approval-card-checked',
        'approval-card-update-checked',
        'approval-action-consumer',
        'pairing-card-checked',
      ],
    }),
    sendChecked: async () => ({ sent: true }),
    replyChecked: reply,
    approvalCardChecked: cards,
    consumeInbound: async (_id, input) => {
      receiver = input;
      return () => {};
    },
  };
  core.externalMessaging.register(createDshImProvider(host)!);
  const binding = await core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/feishu',
    accountRef: 'lark-qa',
    fingerprint,
  });
  await vi.waitFor(() => expect(receiver).toBeDefined());
  core.externalMessaging.senderAccess('ada', {
    kind: 'create-role',
    name: 'Reviewer',
    behavior: 'Review pairing requests.',
  });
  let role = (await core.externalMessaging.snapshot('ada')).roles![0]!;
  core.externalMessaging.senderAccess('ada', {
    kind: 'edit-role',
    id: role.id,
    expectedRevision: role.revision,
    name: role.name,
    behavior: role.behavior,
    capabilities: ['review-pairing'],
    delegableCapabilities: ['approve'],
  });
  role = (await core.externalMessaging.snapshot('ada')).roles![0]!;
  const p = core.externalMessaging.pairing.request(
    binding.id,
    event('ou_reviewer', 'om_reviewer'),
    'conversation',
  );
  await core.externalMessaging.reviewPairing('ada', {
    kind: 'approve',
    id: p.id,
    expectedRevision: p.revision,
    roleId: role.id,
    expectedRoleRevision: role.revision,
  });
  core.externalMessaging.senderAccess('ada', {
    kind: 'create-role',
    name: 'Member',
    behavior: 'Answer normal questions.',
  });
  const member = (await core.externalMessaging.snapshot('ada')).roles!.find(
    (item) => item.name === 'Member',
  )!;
  core.externalMessaging.senderAccess('ada', {
    kind: 'policy',
    restricted: true,
    expectedRevision: (await core.externalMessaging.snapshot('ada')).senderPolicy!.revision,
  });
  async function apply(
    value: (typeof deliveries)[number],
    actorId: string,
    action: MessagingPairingAction['action'],
    roleId?: string,
  ) {
    return receiver!.onAction!(
      {
        kind: 'pairing',
        version: 1,
        channel: 'feishu',
        botId: 'lark-qa',
        fingerprint,
        actorId,
        conversationId: value.conversationId,
        messageId: value.messageId,
        requestId: value.card.requestId,
        action,
        ...(roleId ? { roleId } : {}),
      },
      { signal: receiver!.signal },
    );
  }
  return {
    get core() {
      return core;
    },
    get db() {
      return attachOperationalModule(core.operationalDatabase, 'messaging');
    },
    binding,
    get receiver() {
      return receiver!;
    },
    deliveries,
    cards,
    reply,
    member,
    reviewerRole: role,
    apply,
    failSend() {
      uncertainSend = true;
    },
    async restart() {
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
      cores.splice(cores.indexOf(core), 1);
      core = createCore({ dshHome: home });
      cores.push(core);
      receiver = undefined;
      core.externalMessaging.register(createDshImProvider(host)!);
      await vi.waitFor(() => expect(receiver).toBeDefined());
    },
  };
}

it('pairs a group-only applicant through a public card, refusing non-reviewers and admitting only a fresh question', async () => {
  const f = await fixture();
  await f.receiver.onEvent(event('ou_applicant', 'om_request'), { signal: f.receiver.signal });
  await vi.waitFor(() => expect(f.deliveries).toHaveLength(1));
  const card = f.deliveries[0]!;
  expect(card.conversationId).toBe('oc_group');
  expect(card.card.detail).not.toContain('17 times 19');
  const pending = f.core.externalMessaging.pairing
    .list('ada')
    .find((p) => p.actorId === 'ou_applicant')!;
  expect(pending.status).toBe('pending');
  expect(f.db.read((db) => db.prepare('SELECT count(*) AS n FROM inbox_admissions').get())).toEqual(
    { n: 0 },
  );
  expect((await f.apply(card, 'ou_stranger', 'select-role', f.member.id)).status).toBe('refused');
  expect((await f.apply(card, 'ou_stranger', 'reject-pairing')).status).toBe('refused');
  expect((await f.apply(card, 'ou_reviewer', 'approve-pairing', f.member.id)).status).toBe(
    'refused',
  );
  expect((await f.apply(card, 'ou_reviewer', 'select-role', f.member.id)).status).toBe('queued');
  expect((await f.apply(card, 'ou_reviewer', 'approve-pairing', f.member.id)).status).toBe(
    'queued',
  );
  await vi.waitFor(() => expect(card.card.status).toBe('approved'));
  await vi.waitFor(() =>
    expect(
      f.reply.mock.calls.some((call) => call[2].includes('Please send your question again')),
    ).toBe(true),
  );
  expect((await f.apply(card, 'ou_reviewer', 'approve-pairing', f.member.id)).status).toBe(
    'refused',
  );
  const paired = f.core.externalMessaging.pairing.list('ada').find((p) => p.id === pending.id)!;
  expect(paired).toMatchObject({
    status: 'approved',
    roleId: f.member.id,
    reviewedBy: 'paired-reviewer',
    reviewerActorId: 'ou_reviewer',
  });
  expect(f.db.read((db) => db.prepare('SELECT count(*) AS n FROM inbox_admissions').get())).toEqual(
    { n: 0 },
  );
  await f.receiver.onEvent(event('ou_applicant', 'om_fresh'), { signal: f.receiver.signal });
  await vi.waitFor(() =>
    expect(
      f.db.read((db) => db.prepare('SELECT count(*) AS n FROM inbox_admissions').get()),
    ).toEqual({ n: 1 }),
  );
});

it('excludes Roles with onward delegation outside the ceiling and permits an independent Reject', async () => {
  const f = await fixture();
  const member = f.member;
  f.core.externalMessaging.senderAccess('ada', {
    kind: 'edit-role',
    id: member.id,
    expectedRevision: member.revision,
    name: member.name,
    behavior: member.behavior,
    capabilities: ['approve'],
    delegableCapabilities: ['review-pairing'],
  });
  await f.receiver.onEvent(event('ou_applicant', 'om_request'), { signal: f.receiver.signal });
  await vi.waitFor(() => expect(f.deliveries).toHaveLength(1));
  const card = f.deliveries[0]!;
  expect(card.card.roles.some((role) => role.id === member.id)).toBe(false);
  expect((await f.apply(card, 'ou_reviewer', 'select-role', member.id)).status).toBe('refused');
  expect((await f.apply(card, 'ou_reviewer', 'reject-pairing')).status).toBe('queued');
  await vi.waitFor(() => expect(card.card.status).toBe('rejected'));
  expect(f.db.read((db) => db.prepare('SELECT count(*) AS n FROM inbox_admissions').get())).toEqual(
    { n: 0 },
  );
});

it('uses the current delegation at confirmation, and preserves a Web winner over delayed cards', async () => {
  const f = await fixture();
  await f.receiver.onEvent(event('ou_applicant', 'om_request'), { signal: f.receiver.signal });
  await vi.waitFor(() => expect(f.deliveries).toHaveLength(1));
  const card = f.deliveries[0]!;
  expect((await f.apply(card, 'ou_reviewer', 'select-role', f.member.id)).status).toBe('queued');
  const reviewer = f.core.externalMessaging.pairing
    .list('ada')
    .find((p) => p.actorId === 'ou_reviewer')!;
  f.core.externalMessaging.senderAccess('ada', {
    kind: 'person-permissions',
    id: reviewer.id,
    expectedRevision: reviewer.revision,
    allow: [],
    deny: ['review-pairing'],
    delegateAllow: [],
    delegateDeny: ['approve'],
  });
  expect((await f.apply(card, 'ou_reviewer', 'approve-pairing', f.member.id)).status).toBe(
    'refused',
  );
  const pending = f.core.externalMessaging.pairing
    .list('ada')
    .find((p) => p.actorId === 'ou_applicant')!;
  await f.core.externalMessaging.reviewPairing('ada', {
    kind: 'reject',
    id: pending.id,
    expectedRevision: pending.revision,
  });
  expect((await f.apply(card, 'ou_reviewer', 'reject-pairing')).status).toBe('refused');
  await vi.waitFor(() => expect(card.card.status).toBe('rejected'));
});

it('retains the exact pending receipt/selection across restart without resending a duplicate card', async () => {
  const f = await fixture();
  await f.receiver.onEvent(event('ou_applicant', 'om_request'), { signal: f.receiver.signal });
  await vi.waitFor(() => expect(f.deliveries).toHaveLength(1));
  const card = f.deliveries[0]!;
  await f.apply(card, 'ou_reviewer', 'select-role', f.member.id);
  await vi.waitFor(() => expect(card.card.selectedRoleId).toBe(f.member.id));
  await f.restart();
  expect((await f.apply(card, 'ou_reviewer', 'approve-pairing', f.member.id)).status).toBe(
    'queued',
  );
  await vi.waitFor(() => expect(card.card.status).toBe('approved'));
  expect(f.deliveries).toHaveLength(1);
  expect(
    f.core.externalMessaging.pairing.list('ada').find((p) => p.actorId === 'ou_applicant')?.status,
  ).toBe('approved');
});

it('keeps uncertain delivery pending for Web and does not resend on repeated applicant messages', async () => {
  const f = await fixture();
  f.failSend();
  await f.receiver.onEvent(event('ou_applicant', 'om_request'), { signal: f.receiver.signal });
  await vi.waitFor(() => expect(f.cards).toHaveBeenCalledTimes(1));
  await f.receiver.onEvent(event('ou_applicant', 'om_again'), { signal: f.receiver.signal });
  await f.restart();
  await f.receiver.onEvent(event('ou_applicant', 'om_afterrestart'), { signal: f.receiver.signal });
  expect(f.cards).toHaveBeenCalledTimes(1);
  expect(
    f.core.externalMessaging.pairing.list('ada').find((p) => p.actorId === 'ou_applicant')?.status,
  ).toBe('pending');
  expect(f.db.read((db) => db.prepare('SELECT count(*) AS n FROM inbox_admissions').get())).toEqual(
    { n: 0 },
  );
});

it('sends additional private reviewer copies only after a trusted DM and synchronizes the group/Web winner', async () => {
  const f = await fixture();
  await f.receiver.onEvent(event('ou_reviewer', 'om_privateroute', false), {
    signal: f.receiver.signal,
  });
  await f.receiver.onEvent(event('ou_applicant', 'om_request'), { signal: f.receiver.signal });
  await vi.waitFor(() => expect(f.deliveries).toHaveLength(2));
  const privateCard = f.deliveries.find((value) => value.conversationId === 'oc_ou_reviewer')!;
  expect((await f.apply(privateCard, 'ou_applicant', 'reject-pairing')).status).toBe('refused');
  expect((await f.apply(privateCard, 'ou_reviewer', 'select-role', f.member.id)).status).toBe(
    'queued',
  );
  const pending = f.core.externalMessaging.pairing
    .list('ada')
    .find((p) => p.actorId === 'ou_applicant')!;
  await f.core.externalMessaging.reviewPairing('ada', {
    kind: 'approve',
    id: pending.id,
    expectedRevision: pending.revision,
    roleId: f.member.id,
    expectedRoleRevision: f.member.revision,
  });
  await vi.waitFor(() =>
    expect(f.deliveries.every((value) => value.card.status === 'approved')).toBe(true),
  );
  expect((await f.apply(privateCard, 'ou_reviewer', 'approve-pairing', f.member.id)).status).toBe(
    'refused',
  );
});

it('can grant a management Role without holding its use capability, but refuses a subsequent delegation Deny', async () => {
  const f = await fixture();
  f.core.externalMessaging.senderAccess('ada', {
    kind: 'edit-role',
    id: f.member.id,
    expectedRevision: f.member.revision,
    name: f.member.name,
    behavior: f.member.behavior,
    capabilities: ['approve'],
    delegableCapabilities: ['approve'],
  });
  await f.receiver.onEvent(event('ou_first', 'om_first'), { signal: f.receiver.signal });
  await vi.waitFor(() => expect(f.deliveries).toHaveLength(1));
  const card = f.deliveries[0]!;
  expect((await f.apply(card, 'ou_reviewer', 'select-role', f.member.id)).status).toBe('queued');
  expect((await f.apply(card, 'ou_reviewer', 'approve-pairing', f.member.id)).status).toBe(
    'queued',
  );
  const first = f.core.externalMessaging.pairing.list('ada').find((p) => p.actorId === 'ou_first')!;
  expect(first.capabilities).toContain('approve');
  expect(
    f.core.externalMessaging.pairing.list('ada').find((p) => p.actorId === 'ou_reviewer')!
      .capabilities,
  ).not.toContain('approve');
  await f.receiver.onEvent(event('ou_second', 'om_second'), { signal: f.receiver.signal });
  await vi.waitFor(() => expect(f.deliveries).toHaveLength(2));
  const second = f.deliveries[1]!;
  expect((await f.apply(second, 'ou_reviewer', 'select-role', f.member.id)).status).toBe('queued');
  const reviewer = f.core.externalMessaging.pairing
    .list('ada')
    .find((p) => p.actorId === 'ou_reviewer')!;
  f.core.externalMessaging.senderAccess('ada', {
    kind: 'person-permissions',
    id: reviewer.id,
    expectedRevision: reviewer.revision,
    allow: [],
    deny: [],
    delegateAllow: [],
    delegateDeny: ['approve'],
  });
  expect((await f.apply(second, 'ou_reviewer', 'approve-pairing', f.member.id)).status).toBe(
    'refused',
  );
  expect((await f.apply(second, 'ou_reviewer', 'reject-pairing')).status).toBe('queued');
});

it('checks group-only review and delegation grants again after a durable group Deny changes', async () => {
  const f = await fixture();
  const change = (input: Parameters<typeof f.core.externalMessaging.senderAccess>[1]) =>
    f.core.externalMessaging.senderAccess('ada', input);
  change({
    kind: 'edit-role',
    id: f.reviewerRole.id,
    expectedRevision: f.reviewerRole.revision,
    name: f.reviewerRole.name,
    behavior: f.reviewerRole.behavior,
    capabilities: [],
    delegableCapabilities: [],
  });
  change({
    kind: 'edit-role',
    id: f.member.id,
    expectedRevision: f.member.revision,
    name: f.member.name,
    behavior: f.member.behavior,
    capabilities: ['approve'],
    delegableCapabilities: ['approve'],
  });
  const reviewer = f.core.externalMessaging.pairing
    .list('ada')
    .find((p) => p.actorId === 'ou_reviewer')!;
  change({
    kind: 'create-group',
    bindingId: f.binding.id,
    name: 'Delegated reviewers',
    memberIds: [reviewer.id],
    allow: ['review-pairing'],
    deny: [],
    delegateAllow: ['approve'],
    delegateDeny: [],
  });
  await f.receiver.onEvent(event('ou_applicant', 'om_group_grant'), {
    signal: f.receiver.signal,
  });
  await vi.waitFor(() => expect(f.deliveries).toHaveLength(1));
  const card = f.deliveries[0]!;
  expect((await f.apply(card, 'ou_reviewer', 'select-role', f.member.id)).status).toBe('queued');
  change({
    kind: 'create-group',
    bindingId: f.binding.id,
    name: 'Delegation hold',
    memberIds: [reviewer.id],
    allow: [],
    deny: [],
    delegateAllow: ['approve'],
    delegateDeny: ['approve'],
  });
  expect((await f.apply(card, 'ou_reviewer', 'approve-pairing', f.member.id)).status).toBe(
    'refused',
  );
  await f.restart();
  expect(f.deliveries).toHaveLength(1);
  expect((await f.apply(card, 'ou_reviewer', 'approve-pairing', f.member.id)).status).toBe(
    'refused',
  );
  const hold = (await f.core.externalMessaging.snapshot('ada')).permissionGroups!.find(
    (group) => group.name === 'Delegation hold',
  )!;
  change({ kind: 'delete-group', id: hold.id, expectedRevision: hold.revision });
  expect((await f.apply(card, 'ou_reviewer', 'approve-pairing', f.member.id)).status).toBe(
    'queued',
  );
  expect(
    f.core.externalMessaging.pairing.list('ada').find((p) => p.actorId === 'ou_applicant'),
  ).toMatchObject({ status: 'approved', roleId: f.member.id, capabilities: ['approve'] });
  expect(
    f.core.externalMessaging.pairing.list('ada').find((p) => p.actorId === 'ou_reviewer')!
      .capabilities,
  ).not.toContain('approve');
});

it('requires the confirming reviewer to own the current Role selection on a shared group card', async () => {
  const f = await fixture();
  const p = f.core.externalMessaging.pairing.request(
    f.binding.id,
    event('ou_otherReviewer', 'om_other'),
    'conversation',
  );
  await f.core.externalMessaging.reviewPairing('ada', {
    kind: 'approve',
    id: p.id,
    expectedRevision: p.revision,
    roleId: f.reviewerRole.id,
    expectedRoleRevision: f.reviewerRole.revision,
  });
  await f.receiver.onEvent(event('ou_applicant', 'om_request'), { signal: f.receiver.signal });
  await vi.waitFor(() => expect(f.deliveries).toHaveLength(1));
  const card = f.deliveries[0]!;
  await f.apply(card, 'ou_reviewer', 'select-role', f.member.id);
  await f.apply(card, 'ou_otherReviewer', 'select-role', f.member.id);
  expect((await f.apply(card, 'ou_reviewer', 'approve-pairing', f.member.id)).status).toBe(
    'refused',
  );
  expect((await f.apply(card, 'ou_otherReviewer', 'approve-pairing', f.member.id)).status).toBe(
    'queued',
  );
  expect(
    f.core.externalMessaging.pairing.list('ada').find((p) => p.actorId === 'ou_applicant')
      ?.reviewerActorId,
  ).toBe('ou_otherReviewer');
});

it('refuses a stale Role revision and a changed receipt conversation before any pairing decision', async () => {
  const f = await fixture();
  await f.receiver.onEvent(event('ou_applicant', 'om_request'), { signal: f.receiver.signal });
  await vi.waitFor(() => expect(f.deliveries).toHaveLength(1));
  const card = f.deliveries[0]!;
  expect(
    (
      await f.apply(
        { ...card, conversationId: 'oc_forwarded' },
        'ou_reviewer',
        'select-role',
        f.member.id,
      )
    ).status,
  ).toBe('refused');
  await f.apply(card, 'ou_reviewer', 'select-role', f.member.id);
  f.core.externalMessaging.senderAccess('ada', {
    kind: 'edit-role',
    id: f.member.id,
    expectedRevision: f.member.revision,
    name: 'Updated Role',
    behavior: f.member.behavior,
    capabilities: [],
  });
  expect((await f.apply(card, 'ou_reviewer', 'approve-pairing', f.member.id)).status).toBe(
    'refused',
  );
  expect(
    f.core.externalMessaging.pairing.list('ada').find((p) => p.actorId === 'ou_applicant')?.status,
  ).toBe('pending');
});
