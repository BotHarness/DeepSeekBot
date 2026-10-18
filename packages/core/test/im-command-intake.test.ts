import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createOutboundMessaging } from '../src/messaging/outbound.js';
import {
  MessagingProviderError,
  type MessagingInboundEvent,
  type MessagingProvider,
} from '../src/messaging/provider.js';
import type { ImCommandServices } from '../src/messaging/im-commands.js';
import type { ModelCatalogEntry } from '../src/models/catalog.js';
import type { ModelRoute } from '../src/models/presets.js';
import { createTempRoot } from './helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function fixture() {
  const owner = mountOperationalDatabase({
    dshHome: createTempRoot('bh-im-command-intake-'),
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
  });
  const database = attachOperationalModule(owner, 'messaging');
  const catalog: ModelCatalogEntry[] = ['a', 'b'].map((model) => ({
    provider: 'provider',
    providerName: 'Provider',
    model,
    modelName: model,
    efforts: [{ id: 'high', name: 'High' }],
  }));
  let route: ModelRoute = { provider: 'provider', model: 'a' };
  let commandsAvailable = true;
  const applied: ModelRoute[] = [];
  const host: ImCommandServices = {
    botDisplayName: () => 'Ada',
    plan: async () => ({
      revision: 1,
      sourcePresetId: '',
      sourcePresetName: '',
      appliedAt: '',
      orchestrator: route,
    }),
    catalog: vi.fn(async () => catalog),
    applyModel: vi.fn(async (_slug, next, assertCurrent) => {
      assertCurrent?.();
      applied.push(next);
      route = next;
    }),
    stopTurn: vi.fn(async () => undefined),
    startFreshOrchestrator: vi.fn(async () => 'started' as const),
    turnRunning: () => false,
  };
  const onAdmitted = vi.fn();
  const service = createOutboundMessaging({
    database,
    isBotActive: () => true,
    imCommands: () => (commandsAvailable ? host : undefined),
    onAdmitted,
    timeoutMs: 100,
  });
  cleanups.push(() => {
    service.close();
    owner.close();
  });
  let receiver: Parameters<NonNullable<MessagingProvider['consume']>>[0] | undefined;
  const reply = vi.fn<NonNullable<MessagingProvider['reply']>>(async (input) => {
    expect(input.beforeSend?.()).toBe(true);
    return { accepted: true };
  });
  const account = {
    ref: 'app',
    platform: 'feishu',
    name: 'Lark Bot',
    fingerprint: 'a'.repeat(64),
    connected: true,
  };
  const target = {
    ref: 'human',
    name: 'Human',
    digest: 'b'.repeat(64),
    receiveScope: { kind: 'dm' as const, conversationId: 'oc_private' },
  };
  const provider: MessagingProvider = {
    id: 'dsh-im/feishu',
    accounts: async () => [account],
    targets: async () => [target],
    inspectAccount: async () => account,
    inspect: async () => ({ account, target }),
    consume: async (input) => {
      receiver = input;
      return () => {};
    },
    send: async () => ({ accepted: true }),
    reply,
  };
  service.register(provider);
  const binding = await service.identity('ada', {
    kind: 'bind',
    providerId: provider.id,
    accountRef: account.ref,
    fingerprint: account.fingerprint,
  });
  const event = (text: string, messageId: string): MessagingInboundEvent => ({
    version: 1,
    channel: 'feishu',
    botId: 'app',
    fingerprint: account.fingerprint,
    eventId: messageId,
    messageId,
    actor: { kind: 'user', id: 'ou_human' },
    conversation: { kind: 'dm', id: 'oc_private' },
    mentions: [],
    mentionedAccount: false,
    at: new Date().toISOString(),
    text,
    reply: { messageId, conversationId: 'oc_private', actorId: 'ou_human' },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  });
  return {
    host,
    catalog,
    applied,
    service,
    reply,
    onAdmitted,
    database,
    approve(capabilities: ('approve' | 'answer')[] = ['approve']) {
      const pending = service.pairing.request(binding.id, event('/pair', 'pair'));
      return service.pairing.review('ada', {
        kind: 'approve',
        id: pending.id,
        expectedRevision: pending.revision,
        capabilities,
      });
    },
    revoke(approved: { id: string; revision: number }) {
      service.pairing.review('ada', {
        kind: 'revoke',
        id: approved.id,
        expectedRevision: approved.revision,
      });
      expect(service.pairing.list('ada')[0]?.status).toBe('revoked');
    },
    disableCommands() {
      commandsAvailable = false;
    },
    receive(text: string, messageId = 'command', overrides: Partial<MessagingInboundEvent> = {}) {
      if (!receiver) throw new Error('Not subscribed');
      return receiver.onEvent({ ...event(text, messageId), ...overrides }, receiver.signal);
    },
    async settled(count = 1) {
      await expect
        .poll(
          () =>
            service.history('ada').filter((item) => !['pending', 'in-flight'].includes(item.state))
              .length,
        )
        .toBe(count);
      await tick();
    },
  };
}

it('preserves attachment messages and unavailable-command-service traffic as ordinary intake', async () => {
  const fx = await fixture();
  await fx.receive('/status', 'attachment', {
    attachments: [
      { id: 'file', messageId: 'attachment', resourceKey: 'file-resource', name: 'note.txt' },
    ],
  });
  await expect.poll(() => fx.onAdmitted.mock.calls.length).toBe(1);
  fx.disableCommands();
  await fx.receive('/status', 'unavailable');
  await expect.poll(() => new Set(fx.onAdmitted.mock.calls.map((call) => call[1])).size).toBe(2);
  expect(
    fx.database.read((db) => db.prepare('SELECT count(*) AS n FROM inbox_admissions').get()),
  ).toEqual({ n: 2 });
  expect(fx.reply).not.toHaveBeenCalled();
});

it('refuses a queued mutation after its management pairing is revoked', async () => {
  const fx = await fixture();
  const approved = fx.approve();
  await fx.receive('/model 2');
  expect(fx.applied).toHaveLength(0);
  fx.revoke(approved);
  await fx.settled();
  expect(fx.applied).toHaveLength(0);
  expect(fx.reply.mock.calls[0]![0].text).toContain('management pairing');
});

it('rechecks mutation authority after an asynchronous catalog lookup', async () => {
  const fx = await fixture();
  const approved = fx.approve();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  fx.host.catalog = async () => {
    entered();
    await gate;
    return fx.catalog;
  };
  await fx.receive('/model 2');
  await started;
  fx.revoke(approved);
  release();
  await fx.settled();
  expect(fx.applied).toHaveLength(0);
});

it('requires current management capabilities rather than an answer-only pairing', async () => {
  const fx = await fixture();
  fx.approve(['answer']);
  await fx.receive('/new');
  await fx.settled();
  expect(fx.host.startFreshOrchestrator).not.toHaveBeenCalled();
  expect(fx.reply.mock.calls[0]![0].text).toContain('management pairing');
});

it('executes concurrent model and effort commands in intake order through the shared consumer', async () => {
  const fx = await fixture();
  fx.approve();
  await fx.receive('/model 2', 'model');
  await fx.receive('/effort high', 'effort');
  await fx.settled(2);
  expect(fx.applied).toEqual([
    { provider: 'provider', model: 'b' },
    { provider: 'provider', model: 'b', reasoningEffort: 'high' },
  ]);
  expect(fx.onAdmitted).not.toHaveBeenCalled();
});

it.each(['accepted', 'unknown'] as const)(
  'records a durable %s reply outcome and never repeats a redelivered command',
  async (outcome) => {
    const fx = await fixture();
    if (outcome === 'unknown')
      fx.reply.mockImplementation(async () => {
        throw new MessagingProviderError('connection-lost', 'unknown');
      });
    await fx.receive('/status');
    await fx.settled();
    const intent = fx.service.history('ada')[0]!;
    expect(intent.state).toBe(outcome === 'accepted' ? 'provider-accepted' : 'unknown-outcome');
    expect(
      fx.database.read((db) => db.prepare('SELECT state FROM messaging_outbox_attempts').all()),
    ).toEqual([{ state: intent.state }]);
    await fx.receive('/status');
    await tick();
    expect(fx.reply).toHaveBeenCalledTimes(1);
    expect(fx.service.history('ada')).toHaveLength(1);
    expect(fx.onAdmitted).not.toHaveBeenCalled();
  },
);

it('splits long catalogs into bounded source-bound Outbox replies', async () => {
  const fx = await fixture();
  fx.host.catalog = async () =>
    Array.from({ length: 80 }, (_, index) => ({
      ...fx.catalog[0]!,
      model: `model-${index}`,
      modelName: 'Long model name '.repeat(6),
    }));
  await fx.receive('/model');
  await expect
    .poll(() =>
      fx.database.read((db) => db.prepare('SELECT last_error FROM inbox_admissions').get()),
    )
    .toEqual({ last_error: null });
  expect(fx.reply.mock.calls.length).toBeGreaterThan(1);
  expect(fx.reply.mock.calls.every(([input]) => input.text.length <= 4000)).toBe(true);
  expect(fx.service.history('ada').every((intent) => intent.state === 'provider-accepted')).toBe(
    true,
  );
});
