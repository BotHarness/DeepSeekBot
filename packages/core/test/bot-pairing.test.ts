import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, it, vi } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { registerBridge } from '../src/bridge/rpc.js';
import { setImmediate as tick } from 'node:timers/promises';
import { attachOperationalModule } from '../src/database/owner.js';
import { pairingDefaults } from '../src/messaging/pairing.js';
import { createCore } from '../src/plugin.js';
import { createHumanAttentionQuery } from '../src/runtime/human-attention.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import { createTempRoot } from './helpers.js';
import { owners, cores, fingerprint, event, fixture } from './support/bot-pairing.js';

afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
  for (const owner of owners.splice(0)) owner.close();
});

it('Web review selects exact current-Bot capabilities; restart retains authority and revoke requires fresh review', () => {
  const f = fixture();
  const request = f.pairing.request('binding', event());
  expect(request.updatedAt).toBe(request.createdAt);
  expect(request).toMatchObject({ status: 'pending', capabilities: [], actorId: 'ou_alice' });
  expect(() => f.pairing.assert('ada', 'binding', 'ou_alice', 'approve')).toThrow(
    'pairing-unauthorized',
  );
  f.advance(1000);
  const approved = f.pairing.review('ada', {
    kind: 'approve',
    id: request.id,
    expectedRevision: 1,
    capabilities: ['approve', 'reject'],
  });
  expect(approved.createdAt).toBe(request.createdAt);
  expect(Date.parse(approved.updatedAt!)).toBe(Date.parse(request.createdAt) + 1000);
  expect(f.pairing.assert('ada', 'binding', 'ou_alice', 'approve').id).toBe(request.id);
  for (const [bot, actor, capability] of [
    ['another-bot', 'ou_alice', 'approve'],
    ['ada', 'ou_bob', 'approve'],
    ['ada', 'ou_alice', 'save-rules'],
  ] as const)
    expect(() => f.pairing.assert(bot, 'binding', actor, capability)).toThrow(
      'pairing-unauthorized',
    );
  expect(() =>
    f.pairing.review('ada', {
      kind: 'approve',
      id: request.id,
      expectedRevision: 1,
      capabilities: ['save-rules'],
    }),
  ).toThrow('pairing-stale');
  f.owner.close();
  const resumed = f.mount();
  expect(resumed.pairing.assert('ada', 'binding', 'ou_alice', 'approve')).toMatchObject(approved);
  f.advance(1000);
  const revoked = resumed.pairing.review('ada', {
    kind: 'revoke',
    id: request.id,
    expectedRevision: 2,
  });
  expect(revoked.createdAt).toBe(request.createdAt);
  expect(Date.parse(revoked.updatedAt!)).toBe(Date.parse(request.createdAt) + 2000);
  expect(() => resumed.pairing.assert('ada', 'binding', 'ou_alice', 'approve')).toThrow(
    'pairing-unauthorized',
  );
  const fresh = resumed.pairing.request('binding', event('ou_alice', 'message-2'));
  expect(fresh.id).not.toBe(request.id);
  expect(fresh.capabilities).toEqual([]);
  expect(() => resumed.pairing.assert('ada', 'binding', 'ou_alice', 'approve')).toThrow(
    'pairing-unauthorized',
  );
});

it('expiry, bounded retries/capacity and authenticated account evidence cannot promote a stranger', () => {
  const f = fixture();
  const initial = f.pairing.request('binding', event());
  for (let n = 0; n < 10; n++) expect(f.pairing.request('binding', event()).attempts).toBe(1);
  for (let n = 1; n < pairingDefaults.maxAttempts; n++)
    expect(f.pairing.request('binding', event('ou_alice', `retry-${n}`)).id).toBe(initial.id);
  expect(() => f.pairing.request('binding', event('ou_alice', 'over-limit'))).toThrow(
    'pairing-rate-limited',
  );
  for (const bad of [
    { ...event(), fingerprint: 'b'.repeat(64) },
    { ...event(), botId: 'wrong-account' },
    { ...event(), reply: { ...event().reply, actorId: 'ou_bob' } },
    { ...event(), conversation: { kind: 'group' as const, id: 'oc_private' } },
  ])
    expect(() => f.pairing.request('binding', bad)).toThrow('untrusted-pairing');
  f.advance(pairingDefaults.expiryMs);
  expect(f.pairing.list('ada')[0]?.status).toBe('expired');
  expect(f.pairing.request('binding', event()).status).toBe('expired');
  expect(() =>
    f.pairing.review('ada', {
      kind: 'approve',
      id: initial.id,
      expectedRevision: 1,
      capabilities: ['approve'],
    }),
  ).toThrow('pairing-stale');
  for (let n = 0; n < pairingDefaults.maxPendingPerBot; n++)
    f.pairing.request('binding', event(`ou_actor${n}`, `capacity-${n}`));
  expect(() => f.pairing.request('binding', event('ou_over'))).toThrow('pairing-capacity');
  expect(f.pairing.list('ada').every((item) => item.capabilities.length === 0)).toBe(true);
});

it('revoked identity invalidates authority immediately and a different Bot cannot review a request', () => {
  const f = fixture();
  const request = f.pairing.request('binding', event());
  expect(() =>
    f.pairing.review('another-bot', {
      kind: 'approve',
      id: request.id,
      expectedRevision: 1,
      capabilities: ['approve'],
    }),
  ).toThrow('pairing-unavailable');
  f.pairing.review('ada', {
    kind: 'approve',
    id: request.id,
    expectedRevision: 1,
    capabilities: ['approve'],
  });
  f.db.transaction((db) =>
    db
      .prepare('UPDATE messaging_bindings SET revoked_at = ? WHERE id = ?')
      .run(new Date().toISOString(), 'binding'),
  );
  expect(() => f.pairing.assert('ada', 'binding', 'ou_alice', 'approve')).toThrow(
    'pairing-unauthorized',
  );
});

it('one checked account consumer handles unknown DM pairing ahead of normal Inbox intake, without a model wake', async () => {
  let connected = true;
  let receiver: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  const consume = vi.fn(async (_account, input) => {
    receiver = input;
    return () => {};
  });
  const reply = vi.fn(async (_account, route, _text, options) => {
    expect(options.beforeSend?.()).toBe(true);
    return {
      sent: true as const,
      receipt: { version: 1 as const, messageId: 'reply', conversationId: route.conversationId },
    };
  });
  const warnings: string[] = [];
  const core = createCore({
    dshHome: createTempRoot('bh-pairing-intake-'),
    warn: (message) => warnings.push(message),
  });
  cores.push(core);
  expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const transport: DshImOutboundService = {
    contractVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'lark-qa', channel: 'feishu' }],
    listTargets: async () => [
      { targetId: 'owner', kind: 'user', route: { openId: 'ou_alice', chatId: 'oc_private' } },
    ],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'feishu',
      connected,
      account: { fingerprint, name: 'Lark QA' },
      capabilities: ['proactive-text-checked', 'exclusive-text-consumer', 'reply-text-checked'],
    }),
    sendChecked: async () => ({ sent: true }),
    consumeInbound: consume,
    replyChecked: reply,
  };
  core.externalMessaging.register(createDshImProvider(transport)!);
  const identity = await core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/feishu',
    accountRef: 'lark-qa',
    fingerprint,
  });
  const target = (await core.externalMessaging.targets('dsh-im/feishu', 'lark-qa'))[0]!;
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: 'dsh-im/feishu',
    accountRef: 'lark-qa',
    targetRef: 'owner',
    fingerprint,
    targetDigest: target.digest,
  });
  await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
  expect(consume).toHaveBeenCalledTimes(1);
  expect((await core.externalMessaging.snapshot('ada')).pairingReceivers?.[0]?.status).toBe(
    'receiving',
  );
  connected = false;
  expect((await core.externalMessaging.snapshot('ada')).pairingReceivers?.[0]?.status).toBe(
    'unavailable',
  );
  connected = true;
  await receiver!.onEvent(event(), { signal: receiver!.signal });
  await receiver!.onEvent(
    {
      ...event('ou_stranger', 'stranger'),
      conversation: { kind: 'dm', id: 'oc_stranger' },
      reply: { ...event('ou_stranger', 'stranger').reply, conversationId: 'oc_stranger' },
    },
    { signal: receiver!.signal },
  );
  await tick();
  const db = attachOperationalModule(core.operationalDatabase, 'test');
  expect(db.read((db) => db.prepare('SELECT * FROM source_events').all())).toEqual([]);
  expect(db.read((db) => db.prepare('SELECT * FROM inbox_admissions').all())).toEqual([]);
  expect(core.externalMessaging.pairing.list('ada')).toHaveLength(2);
  expect(reply).toHaveBeenCalledTimes(2);
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
  const bridge = registerBridge(
    new Context().extend({ invocation: { peer: { principal: { kind: 'owner' } } } }),
    () => methods,
  );
  const pending = core.externalMessaging.pairing.list('ada').find((p) => p.actorId === 'ou_alice')!;
  const review = {
    kind: 'approve' as const,
    id: pending.id,
    expectedRevision: pending.revision,
    capabilities: ['answer' as const],
  };
  expect(
    await methods.pairingReview({ slug: 'ada', input: { ...review, approvedBy: 'chat-text' } }),
  ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  await expect(bridge.pairingReview('another-bot', review)).rejects.toMatchObject({
    code: 'pairing-unavailable',
  });
  const approved = await bridge.pairingReview('ada', review);
  expect(core.externalMessaging.pairing.assert('ada', identity.id, 'ou_alice', 'answer').id).toBe(
    approved.pairing.id,
  );
  await expect(bridge.pairingReview('ada', review)).rejects.toMatchObject({
    code: 'pairing-stale',
  });
  await bridge.pairingReview('ada', {
    kind: 'revoke',
    id: pending.id,
    expectedRevision: approved.pairing.revision,
  });
  expect(() =>
    core.externalMessaging.pairing.assert('ada', identity.id, 'ou_alice', 'answer'),
  ).toThrow('pairing-unauthorized');

  await expect(
    receiver!.onEvent({ ...event(), fingerprint: 'b'.repeat(64) }, { signal: receiver!.signal }),
  ).rejects.toThrow('untrusted-source');
  await core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: identity.id,
    expectedRevision: identity.revision,
  });
  expect(receiver!.signal.aborted).toBe(true);
  const lifecycle = warnings
    .filter((message) => message.includes('"event":"bot-pairing"'))
    .map((message) => JSON.parse(message));
  expect(lifecycle).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        phase: 'receiver-ready',
        initiator: 'account-lifecycle',
        durationMs: expect.any(Number),
      }),
      expect.objectContaining({
        phase: 'receiver-released',
        reason: 'identity-reconciled',
        durationMs: expect.any(Number),
      }),
    ]),
  );
  expect(warnings.join('')).not.toContain('ou_alice');
  expect(warnings.join('')).not.toContain(fingerprint);
});

it('a paused identity fails closed but still allows Web revocation, and resuming cannot resurrect the grant', () => {
  const f = fixture();
  const request = f.pairing.request('binding', event());
  expect(() =>
    f.pairing.review('ada', {
      kind: 'approve',
      id: request.id,
      expectedRevision: 1,
      capabilities: [],
    }),
  ).toThrow();
  f.pairing.review('ada', {
    kind: 'approve',
    id: request.id,
    expectedRevision: 1,
    capabilities: ['answer'],
  });
  f.db.transaction((db) =>
    db
      .prepare('UPDATE messaging_bindings SET enabled = 0, enabled_inherited = 0 WHERE id = ?')
      .run('binding'),
  );
  expect(f.pairing.list('ada')[0]?.status).toBe('unavailable');
  expect(() => f.pairing.assert('ada', 'binding', 'ou_alice', 'answer')).toThrow(
    'pairing-unauthorized',
  );
  f.pairing.review('ada', { kind: 'revoke', id: request.id, expectedRevision: 2 });
  f.db.transaction((db) =>
    db.prepare('UPDATE messaging_bindings SET enabled = 1 WHERE id = ?').run('binding'),
  );
  expect(() => f.pairing.assert('ada', 'binding', 'ou_alice', 'answer')).toThrow(
    'pairing-unauthorized',
  );
  const fresh = f.pairing.request('binding', event('ou_alice', 'new-after-pause'));
  expect(fresh.capabilities).toEqual([]);
});

it('an unbound identity cannot exhaust the replacement identity approved-capacity budget', () => {
  const f = fixture();
  for (let n = 0; n < pairingDefaults.maxApprovedPerBot; n++) {
    const request = f.pairing.request('binding', event(`ou_user${n}`, `approve-${n}`));
    f.pairing.review('ada', {
      kind: 'approve',
      id: request.id,
      expectedRevision: 1,
      capabilities: ['answer'],
    });
  }
  const overflow = f.pairing.request('binding', event('ou_overflow', 'over-capacity'));
  expect(() =>
    f.pairing.review('ada', {
      kind: 'approve',
      id: overflow.id,
      expectedRevision: 1,
      capabilities: ['answer'],
    }),
  ).toThrow('pairing-capacity');
  f.db.transaction((db) => {
    db.prepare('UPDATE messaging_bindings SET revoked_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      'binding',
    );
    db.prepare(
      'INSERT INTO messaging_bindings (id, bot_slug, provider_id, platform, account_ref, fingerprint, created_at, display_name) SELECT ?, bot_slug, provider_id, platform, account_ref, fingerprint, created_at, display_name FROM messaging_bindings WHERE id = ?',
    ).run('replacement', 'binding');
  });
  expect(() => f.pairing.assert('ada', 'binding', 'ou_user0', 'answer')).toThrow(
    'pairing-unauthorized',
  );
  const request = f.pairing.request('replacement', event('ou_user0', 'replacement-request'));
  expect(request.capabilities).toEqual([]);
  f.pairing.review('ada', {
    kind: 'approve',
    id: request.id,
    expectedRevision: 1,
    capabilities: ['answer'],
  });
  expect(f.pairing.assert('ada', 'replacement', 'ou_user0', 'answer').id).toBe(request.id);
});

it('pending pairing requests reach the action inbox until reviewed', () => {
  const f = fixture();
  const attention = createHumanAttentionQuery(attachOperationalModule(f.owner, 'human-attention'));
  const actions = () =>
    attention
      .list(OWNER_HUMAN_CONTEXT, { category: 'action', sort: 'newest' })
      .items.filter((item) => item.kind === 'pairing-request');
  const management = f.pairing.request('binding', event());
  const conversation = f.pairing.request('binding', event('ou_bob', 'message-2'), 'conversation');
  expect(actions()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        botSlug: 'ada',
        channelId: 'dm-ada',
        requestId: management.id,
        summary: `management · Alice QA · ${management.reference}`,
      }),
      expect.objectContaining({
        requestId: conversation.id,
        summary: `conversation · Alice QA · ${conversation.reference}`,
      }),
    ]),
  );
  f.pairing.review('ada', { kind: 'reject', id: management.id, expectedRevision: 1 });
  expect(actions().map((item) => item.requestId)).toEqual([conversation.id]);
});
