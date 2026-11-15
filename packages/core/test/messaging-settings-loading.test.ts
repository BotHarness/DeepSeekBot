import { setImmediate as tick } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import type { MessagingProvider } from '../src/messaging/provider.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

async function fixture(platform = 'qq', seedConversation = true) {
  const agents: BotAgentAdapter = {
    async runOrchestrator() {},
    async runAssignment() {},
    requestAssignment() {
      return { delivery: 'steer' };
    },
    async stopAssignment() {},
    async close() {},
  };
  const core = createCore({ dshHome: createTempRoot('botharness-settings-loading-'), agents });
  const account = {
    ref: 'app',
    platform,
    typingSupported: true,
    name: 'Saved app',
    fingerprint: 'a'.repeat(64),
    connected: true,
  };
  const target = {
    ref: 'group',
    name: 'Saved group',
    digest: 'digest',
    receiveScope: { kind: 'group' as const, conversationId: 'group' },
  };
  let consumer: Parameters<NonNullable<MessagingProvider['consume']>>[0] | undefined;
  let reads = 0;
  let held: Promise<void> | undefined;
  let release: () => void = () => {};
  const inspect = async () => {
    reads++;
    if (held) await held;
    return account;
  };
  const provider: MessagingProvider = {
    id: 'qa/qq',
    accounts: async () => [await inspect()],
    targets: async () => [target],
    inspectAccount: inspect,
    inspect: async () => ({ account: await inspect(), target }),
    consume: async (input) => {
      consumer = input;
      return () => {};
    },
    send: async () => ({ accepted: true }),
    reply: async () => ({ accepted: true }),
  };
  core.externalMessaging.register(provider);
  core.registry.create({ slug: 'qa', displayName: 'Settings QA' });
  await core.externalMessaging.identity('qa', {
    kind: 'bind',
    providerId: provider.id,
    accountRef: 'app',
    fingerprint: account.fingerprint,
  });
  if (!consumer) throw Error('Missing receiver');
  if (platform === 'qq' && seedConversation)
    await consumer.onEvent(
      {
        version: 1,
        channel: 'qq',
        botId: 'app',
        fingerprint: account.fingerprint,
        eventId: 'first',
        messageId: 'first',
        actor: { kind: 'user', id: 'member' },
        conversation: { kind: 'group', id: 'group', name: 'Saved group' },
        mentions: [{ id: 'app', key: '@app' }],
        mentionedAccount: true,
        at: new Date(Date.now() + 1000).toISOString(),
        text: 'fixture',
        reply: { messageId: 'first', conversationId: 'group', actorId: 'member' },
        replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
      },
      consumer.signal,
    );
  for (let i = 0; i < 4; i++) await tick();
  await core.runtime.whenIdle();
  const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'qa')!;
  const room = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
    name: 'Settings group',
    members: ['qa'],
  });
  reads = 0;
  return {
    core,
    account,
    provider,
    dm,
    room,
    get reads() {
      return reads;
    },
    resetReads() {
      reads = 0;
    },
    hold() {
      held = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    release() {
      release();
      held = undefined;
    },
    async close() {
      release();
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
    },
  };
}

it('projects checked Weixin typing support from the bound account in status mode', async () => {
  const fx = await fixture('weixin');
  try {
    expect(
      (await fx.core.externalMessaging.snapshot('qa', 'saved')).identities?.[0]?.typing?.supported,
    ).toBe(false);
    expect(
      (await fx.core.externalMessaging.snapshot('qa', 'status')).identities?.[0]?.typing?.supported,
    ).toBe(true);
    expect(fx.reads).toBe(1);
  } finally {
    await fx.close();
  }
});

it('returns saved identity and conversation settings before live checks complete', async () => {
  const fx = await fixture();
  fx.hold();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      fx.core.externalMessaging.snapshot('qa', 'saved'),
      new Promise<'blocked'>((resolve) => {
        timer = setTimeout(() => resolve('blocked'), 250);
      }),
    ]);
    expect(result).not.toBe('blocked');
    expect(result).toMatchObject({
      checks: 'pending',
      identities: [{ name: 'Saved app' }],
      grants: [{ targetName: 'Saved group' }],
    });
    expect(fx.reads).toBe(0);
  } finally {
    clearTimeout(timer);
    await fx.close();
  }
});

it('deduplicates bound-account status checks and does not enumerate unrelated Providers', async () => {
  const fx = await fixture();
  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let unrelatedReads = 0;
  fx.core.externalMessaging.register({
    ...fx.provider,
    id: 'unrelated',
    accounts: async () => {
      unrelatedReads++;
      await blocked;
      return [];
    },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const snapshot = await Promise.race([
      fx.core.externalMessaging.snapshot('qa', 'status'),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(Error('Status waited for discovery')), 250);
      }),
    ]);
    expect(snapshot.identities?.[0]?.availability).toBe('available');
    expect(snapshot.grants[0]?.availability).toBe('available');
    expect(fx.reads).toBe(1);
    expect(unrelatedReads).toBe(0);
    fx.account.fingerprint = 'b'.repeat(64);
    expect(
      (await fx.core.externalMessaging.snapshot('qa', 'status')).identities?.[0]?.availability,
    ).toBe('rebind-required');
    expect(fx.reads).toBe(2);
  } finally {
    clearTimeout(timer);
    release();
    await fx.close();
  }
});

it('returns saved connector routes independently of discovery and labels checks pending', async () => {
  const fx = await fixture();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const grant = (await fx.core.externalMessaging.snapshot('qa')).grants[0]!;
    await fx.core.externalMessaging.inbound.channelBridge(fx.room.id, {
      kind: 'add',
      grantId: grant.id,
      expectedGrantRevision: grant.revision,
      delivery: 'channel',
      name: 'Saved connector',
      enabled: true,
      collection: 'mentions',
      collectionInheritance: 'inherit',
    });
    fx.hold();
    const result = await Promise.race([
      fx.core.externalMessaging.channelBridges(fx.room.id, 'saved'),
      new Promise<'blocked'>((resolve) => {
        timer = setTimeout(() => resolve('blocked'), 250);
      }),
    ]);
    expect(result).toMatchObject({ checks: 'pending', bridges: [{ name: 'Saved connector' }] });
  } finally {
    clearTimeout(timer);
    await fx.close();
  }
});

it('never uses a saved or previous status view to authorize an identity mutation', async () => {
  const fx = await fixture();
  try {
    const previous = await fx.core.externalMessaging.snapshot('qa', 'status');
    const identity = previous.identities![0]!;
    fx.account.fingerprint = 'b'.repeat(64);
    const saved = await fx.core.externalMessaging.snapshot('qa', 'saved');
    expect(saved.checks).toBe('pending');
    expect(saved.identities?.[0]?.revision).toBe(identity.revision);
    await expect(
      fx.core.externalMessaging.identity('qa', {
        kind: 'update',
        id: identity.id,
        expectedRevision: identity.revision,
        name: 'Changed',
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: 'rebind-required' });
  } finally {
    await fx.close();
  }
});

it('shares account verification across explicit targets without skipping target checks', async () => {
  const fx = await fixture('qq', false);
  let targetChecks = 0;
  const targets = ['one', 'two'].map((ref) => ({
    ref,
    name: ref,
    digest: ref,
    receiveScope: { kind: 'group' as const, conversationId: ref },
  }));
  try {
    fx.core.externalMessaging.register({
      ...fx.provider,
      targets: async () => targets,
      inspect: async (_ref, targetRef, checkedAccount) => {
        targetChecks++;
        return {
          account: checkedAccount ?? (await fx.provider.inspectAccount!('app')),
          target: targets.find((t) => t.ref === targetRef)!,
        };
      },
    });
    for (const target of targets)
      await fx.core.externalMessaging.authorize({
        botSlug: 'qa',
        providerId: fx.provider.id,
        accountRef: 'app',
        fingerprint: fx.account.fingerprint,
        targetRef: target.ref,
        targetDigest: target.digest,
      });
    await tick();
    fx.resetReads();
    targetChecks = 0;
    const snapshot = await fx.core.externalMessaging.snapshot('qa', 'status');
    expect(snapshot.grants).toHaveLength(2);
    expect(snapshot.grants.every((g) => g.availability === 'available')).toBe(true);
    expect(fx.reads).toBe(1);
    expect(targetChecks).toBe(2);
  } finally {
    await fx.close();
  }
});

it('invalidates an already checked Provider while another account delays the snapshot', async () => {
  const fx = await fixture();
  let release: () => void = () => {};
  const held = new Promise<void>((done) => {
    release = done;
  });
  let hold = false;
  const other = { ...fx.account, ref: 'other', fingerprint: 'b'.repeat(64) };
  fx.core.externalMessaging.register({
    ...fx.provider,
    id: 'qa/slow',
    inspectAccount: async () => {
      if (hold) await held;
      return other;
    },
  });
  try {
    await fx.core.externalMessaging.identity('qa', {
      kind: 'bind',
      providerId: 'qa/slow',
      accountRef: 'other',
      fingerprint: other.fingerprint,
    });
    hold = true;
    const pending = fx.core.externalMessaging.snapshot('qa', 'status');
    await tick();
    await tick();
    fx.core.externalMessaging.register({ ...fx.provider });
    release();
    const snapshot = await pending;
    expect(
      snapshot.identities?.find((row) => row.providerId === fx.provider.id)?.availability,
    ).toBe('unavailable');
    expect(snapshot.accounts.some((row) => row.providerId === fx.provider.id)).toBe(false);
  } finally {
    release();
    await fx.close();
  }
});

it('rejects stale inspection results after replacement and uses the new registration on the next read', async () => {
  const fx = await fixture();
  try {
    fx.hold();
    const old = fx.core.externalMessaging.snapshot('qa', 'status');
    await tick();
    const changed = { ...fx.account, fingerprint: 'b'.repeat(64) };
    fx.core.externalMessaging.register({ ...fx.provider, inspectAccount: async () => changed });
    fx.release();
    expect((await old).identities?.[0]?.availability).not.toBe('available');
    expect(
      (await fx.core.externalMessaging.snapshot('qa', 'status')).identities?.[0]?.availability,
    ).toBe('rebind-required');
  } finally {
    await fx.close();
  }
});
