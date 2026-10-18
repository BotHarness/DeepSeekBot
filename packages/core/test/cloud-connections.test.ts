import type { MessagingInboundEvent } from '../src/messaging/provider.js';
import { createCloudProvider, pollCloudPage } from '../src/cloud/provider.js';
import { Context } from '@deepseek-ai/cordis';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { CloudConnections } from '../src/cloud/connections.js';
import { CloudTransport, connectionFor } from '../src/cloud/transport.js';
import { publicInstance } from '../src/cloud/instance-contract.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot } from './helpers.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
const config = publicInstance({
  instanceId: 'uat-test',
  environment: 'uat',
  server: 'https://uat.example.test',
  clientId: 'client_test',
  issuer: 'https://api.workos.com/user_management/client_test',
  authkitDomain: 'test-staging.authkit.app',
});
const credential = {
  version: 1 as const,
  config,
  organizationId: 'org_test',
  channelId: 'ch_' + 'a'.repeat(64),
  actorId: 'ag_' + 'b'.repeat(64),
  ownerUserId: 'user_owner',
  name: 'Untrusted local label',
  operationId: 'cloud-import-test-0001',
  secret: 'c'.repeat(64),
};
const connection = connectionFor(credential);
const identity = {
  organizationId: credential.organizationId,
  channelId: credential.channelId,
  agent: {
    actorId: credential.actorId,
    ownerUserId: credential.ownerUserId,
    name: 'Verified Agent',
    kind: 'agent',
    state: 'active',
    historyAfter: 12,
  },
};
async function fixture() {
  const root = createTempRoot('cloud-connections-'),
    ctx = new Context();
  const fiber = ctx.plugin(LocalCredentialProvider, {
    path: join(root, '.credentials.yaml'),
    watch: false,
  });
  await fiber.await();
  const db = mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const port = attachOperationalModule(db, 'messaging');
  let responder: typeof fetch = async (url, init) => {
    expect(init?.redirect).toBe('error');
    if (String(url).endsWith('/.well-known/open-cloud-groups')) {
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
      return Response.json(config);
    }
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer tob_agent_' + credential.actorId + '.' + credential.secret,
    );
    return Response.json(identity);
  };
  const fetcher: typeof fetch = (...args) => responder(...args);
  const log = vi.fn();
  const owner = new CloudConnections(port, () => ctx.credentials, new CloudTransport(fetcher), log);
  cleanup.push(async () => {
    await owner.close();
    db.close();
    await fiber.dispose();
  });
  return {
    root,
    owner,
    ctx,
    port,
    db,
    log,
    respond: (next: typeof fetch) => {
      responder = next;
    },
    responder: () => responder,
  };
}
it('qualifies canonical identity then persists only metadata in the Operational Database and secret in native Credentials', async () => {
  const f = await fixture();
  const view = await f.owner.import(credential);
  expect(view.connection.name).toBe('Verified Agent');
  expect(view.cursor).toBe(12);
  expect(view.policy.allowedUsers).toEqual([]);
  expect(view.policy.forwardTargets).toEqual([]);
  expect(JSON.stringify(f.owner.list())).not.toContain(credential.secret);
  const stored = f.port.read((db) => db.prepare('SELECT * FROM cloud_connections').all());
  expect(JSON.stringify(stored)).not.toContain(credential.secret);
  expect(JSON.stringify(f.log.mock.calls)).not.toContain(credential.secret);
  const record = await f.ctx.credentials.readRecord(
    credentialKey('botharness-core', connection.id),
  );
  expect(record?.kind).toBe('grant');
  expect(await f.owner.secret(connection.id)).toBe(credential.secret);
  const policy = {
    allowedUsers: ['user_original'],
    forwardTargets: ['ag_' + 'd'.repeat(64)],
    environment: 'Host A',
  };
  const updated = f.owner.setPolicy(connection.id, view.revision, policy);
  expect((await f.owner.import(credential)).revision).toBe(updated.revision);
  expect(f.owner.current(connection.id).policy).toEqual(policy);
  expect(() => f.owner.setPolicy(connection.id, view.revision, policy)).toThrow(
    'CLOUD_CONNECTION_CHANGED',
  );
});
it('never reads or sends a credential after changed discovery and rejects redirected endpoints', async () => {
  let reads = 0,
    sent = 0;
  const transport = new CloudTransport(async (url, init) => {
    sent++;
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    return Response.json({ ...config, instanceId: 'another' });
  });
  await expect(
    transport.call(
      connection,
      async () => {
        reads++;
        return credential.secret;
      },
      '/identity',
      new AbortController().signal,
    ),
  ).rejects.toThrow('INSTANCE_CONFIG_CHANGED');
  expect(reads).toBe(0);
  expect(sent).toBe(1);
  await expect(
    transport.call(
      connection,
      async () => credential.secret,
      '/messages/../../other',
      new AbortController().signal,
    ),
  ).rejects.toThrow('INVALID_CLOUD_PATH');
  expect(sent).toBe(1);
  const redirect = new CloudTransport(
    async () => new Response(null, { status: 302, headers: { Location: 'https://other.test' } }),
  );
  await expect(
    redirect.call(
      connection,
      async () => {
        reads++;
        return credential.secret;
      },
      '/identity',
      new AbortController().signal,
    ),
  ).rejects.toThrow('CLOUD_DISCOVERY_UNAVAILABLE');
  expect(reads).toBe(0);
});
it('rejects forged file ownership before saving native credentials or activating metadata', async () => {
  const f = await fixture();
  await expect(f.owner.import({ ...credential, ownerUserId: 'user_forged' })).rejects.toThrow(
    'CLOUD_IDENTITY_MISMATCH',
  );
  expect(f.owner.list()).toEqual([]);
  expect(existsSync(join(f.root, '.credentials.yaml'))).toBe(false);
});
it('recovers a native write committed before acknowledgement, but rejects a conflicting stored secret', async () => {
  const f = await fixture();
  const modify = f.ctx.credentials.modifyRecord.bind(f.ctx.credentials);
  vi.spyOn(f.ctx.credentials, 'modifyRecord').mockImplementationOnce(async (...args) => {
    await modify(...args);
    throw Error('lost native response');
  });
  const imported = await f.owner.import(credential);
  expect(imported.active).toBe(true);
  f.respond(async (url) => Response.json(String(url).endsWith('/identity') ? identity : config));
  await expect(f.owner.import({ ...credential, secret: 'd'.repeat(64) })).rejects.toThrow(
    'CLOUD_CREDENTIAL_CONFLICT',
  );
  expect(await f.owner.secret(connection.id)).toBe(credential.secret);
});
it('removal disables the connection before slow native cleanup and interrupts in-flight responses', async () => {
  const f = await fixture();
  const imported = await f.owner.import(credential);
  const prior = f.responder();
  let started!: () => void, finish!: () => void;
  const entered = new Promise<void>((r) => {
    started = r;
  });
  const hold = new Promise<void>((r) => {
    finish = r;
  });
  f.respond(async (url, init) => {
    if (String(url).endsWith('/messages')) {
      started();
      await hold;
      return Response.json({ messages: [] });
    }
    return prior(url, init);
  });
  const pending = f.owner
    .call(connection.id, '/messages', new AbortController().signal)
    .catch((e) => e);
  await entered;
  const del = f.ctx.credentials.deleteRecord.bind(f.ctx.credentials);
  let removed!: () => void;
  const delay = new Promise<void>((r) => {
    removed = r;
  });
  vi.spyOn(f.ctx.credentials, 'deleteRecord').mockImplementationOnce(async (key) => {
    await delay;
    return del(key);
  });
  const removal = f.owner.remove(connection.id, imported.revision);
  await vi.waitFor(() => expect(f.owner.get(connection.id).active).toBe(false));
  finish();
  expect((await pending).code).toBe('CLOUD_CONNECTION_DISABLED');
  removed();
  expect((await removal).credentialRemoved).toBe(true);
  await expect(f.owner.secret(connection.id)).rejects.toThrow('CLOUD_CONNECTION_DISABLED');
  const reimported = await f.owner.import(credential);
  expect(reimported.active).toBe(true);
  expect(reimported.policy.allowedUsers).toEqual([]);
});
it('retains safe cursor and exposes retryable cleanup when native deletion fails', async () => {
  const f = await fixture();
  const view = await f.owner.import(credential);
  f.owner.advance(connection.id, 12, 15);
  expect(() => f.owner.advance(connection.id, 12, 20)).toThrow();
  expect(f.owner.get(connection.id).cursor).toBe(15);
  vi.spyOn(f.ctx.credentials, 'deleteRecord').mockRejectedValueOnce(Error('failed'));
  const removed = await f.owner.remove(connection.id, view.revision);
  expect(removed.active).toBe(false);
  expect(removed.credentialRemoved).toBe(false);
  const retry = await f.owner.remove(connection.id, removed.revision);
  expect(retry.credentialRemoved).toBe(true);
  expect((await f.owner.import(credential)).cursor).toBe(15);
});
it('refuses unknown policy fields and self-forwarding, and closes calls without leaking remote errors', async () => {
  const f = await fixture();
  const v = await f.owner.import(credential);
  for (const policy of [
    { ...v.policy, shell: true },
    { ...v.policy, forwardTargets: [connection.actorId] },
    { ...v.policy, allowedUsers: ['user_x', 'user_x'] },
  ])
    expect(() => f.owner.setPolicy(connection.id, v.revision, policy)).toThrow(
      'INVALID_CLOUD_POLICY',
    );
  const prior = f.responder();
  f.respond(async (url, init) =>
    String(url).endsWith('/messages')
      ? Response.json({ error: { code: credential.secret } }, { status: 500 })
      : prior(url, init),
  );
  await expect(
    f.owner.call(connection.id, '/messages', new AbortController().signal),
  ).rejects.toThrow('CLOUD_UNAVAILABLE');
  await f.owner.close();
  await expect(
    f.owner.call(connection.id, '/messages', new AbortController().signal),
  ).rejects.toThrow('CLOUD_CLOSED');
});
const work = {
  version: 1 as const,
  requestId: 'wr_' + 'd'.repeat(64),
  channelId: credential.channelId,
  requesterUserId: 'user_original',
  targetActorId: credential.actorId,
  capability: 'health-check' as const,
  createdAt: '2026-10-18T00:00:00.000Z',
  expiresAt: '2026-10-18T00:05:00.000Z',
  delegation: {
    parentRequestId: 'wr_' + 'e'.repeat(64),
    actorId: 'ag_' + 'f'.repeat(64),
    hops: 1 as const,
  },
};
function msg(sequence: number, extra: Record<string, unknown> = {}) {
  return {
    sequence,
    authorId: 'user_original',
    authorType: 'human',
    text: 'Synthetic message',
    createdAt: work.createdAt,
    kind: 'text',
    payload: null,
    ...extra,
  };
}
it('keeps remote Agent identity and original Human provenance while plain text does not wake the Bot', async () => {
  const f = await fixture();
  await f.owner.import(credential);
  f.owner.setPolicy(connection.id, 1, {
    allowedUsers: ['user_original'],
    forwardTargets: [],
    environment: 'host-b',
  });
  const previous = f.responder();
  f.respond(async (url, init) =>
    String(url).includes('/messages?')
      ? Response.json({
          messages: [
            msg(13),
            msg(14, {
              authorType: 'agent',
              authorId: work.delegation.actorId,
              kind: 'work_request',
              payload: work,
            }),
            msg(15, { authorType: 'agent', authorId: credential.actorId }),
          ],
          nextCursor: 15,
          hasMore: false,
        })
      : previous(url, init),
  );
  const onEvent = vi.fn(async (_event: MessagingInboundEvent) => ({ accepted: true as const })),
    onEcho = vi.fn(async () => ({ accepted: true as const }));
  await pollCloudPage(f.owner, {
    accountRef: connection.id,
    fingerprint: connection.fingerprint,
    signal: new AbortController().signal,
    onEvent,
    onEcho,
  });
  expect(onEvent).toHaveBeenCalledTimes(2);
  expect(onEcho).toHaveBeenCalledTimes(1);
  const first = onEvent.mock.calls[0]?.[0],
    second = onEvent.mock.calls[1]?.[0];
  expect(first).toMatchObject({
    actor: { kind: 'user', id: 'user_original' },
    mentionedAccount: false,
  });
  expect(second).toMatchObject({
    actor: { kind: 'agent', id: work.delegation.actorId },
    cloudWork: work,
    mentionedAccount: true,
  });
  expect(f.owner.current(connection.id).cursor).toBe(15);
});
it('advances only committed delivery and retries the same stable source identity after consumer failure', async () => {
  const f = await fixture();
  await f.owner.import(credential);
  const previous = f.responder();
  const messages = [msg(13), msg(14)];
  f.respond(async (url, init) =>
    String(url).includes('/messages?')
      ? Response.json({
          messages: messages.filter(
            (m) => m.sequence > Number(new URL(String(url)).searchParams.get('after')),
          ),
          nextCursor: 14,
          hasMore: false,
        })
      : previous(url, init),
  );
  const admitted: string[] = [];
  let fail = true;
  const onEvent = vi.fn(async (event: { messageId: string }) => {
    admitted.push(event.messageId);
    if (event.messageId === '14' && fail) {
      fail = false;
      throw Error('commit failed');
    }
    return { accepted: true as const };
  });
  const input = {
    accountRef: connection.id,
    fingerprint: connection.fingerprint,
    signal: new AbortController().signal,
    onEvent,
  };
  await expect(pollCloudPage(f.owner, input)).rejects.toThrow('commit failed');
  expect(f.owner.get(connection.id).cursor).toBe(13);
  await pollCloudPage(f.owner, input);
  expect(admitted).toEqual(['13', '14', '14']);
  expect(f.owner.get(connection.id).cursor).toBe(14);
});
it('validates an entire page before delivery and never checkpoints an aborted acknowledgement', async () => {
  const f = await fixture();
  await f.owner.import(credential);
  const previous = f.responder();
  const onEvent = vi.fn(async () => ({ accepted: true as const }));
  for (const page of [
    { messages: [msg(13), msg(13)], nextCursor: 13, hasMore: false },
    { messages: [msg(13)], nextCursor: 99, hasMore: false },
    { messages: [], nextCursor: 12, hasMore: true },
    {
      messages: [
        msg(13, {
          kind: 'work_request',
          payload: { ...work, channelId: 'ch_' + '9'.repeat(64) },
          authorType: 'agent',
          authorId: work.delegation.actorId,
        }),
      ],
      nextCursor: 13,
      hasMore: false,
    },
  ]) {
    f.respond(async (url, init) =>
      String(url).includes('/messages?') ? Response.json(page) : previous(url, init),
    );
    await expect(
      pollCloudPage(f.owner, {
        accountRef: connection.id,
        fingerprint: connection.fingerprint,
        signal: new AbortController().signal,
        onEvent,
      }),
    ).rejects.toThrow('INVALID_CLOUD_MESSAGE');
  }
  expect(onEvent).not.toHaveBeenCalled();
  expect(f.owner.get(connection.id).cursor).toBe(12);
  const controller = new AbortController();
  f.respond(async (url, init) =>
    String(url).includes('/messages?')
      ? Response.json({ messages: [msg(13)], nextCursor: 13, hasMore: false })
      : previous(url, init),
  );
  await expect(
    pollCloudPage(f.owner, {
      accountRef: connection.id,
      fingerprint: connection.fingerprint,
      signal: controller.signal,
      onEvent: async () => {
        controller.abort();
        return { accepted: true };
      },
    }),
  ).rejects.toThrow();
  expect(f.owner.get(connection.id).cursor).toBe(12);
});
it('sends checked text through the existing Outbox operation identity, with uncertain network results remaining unknown', async () => {
  const f = await fixture();
  await f.owner.import(credential);
  const provider = createCloudProvider(f.owner);
  const previous = f.responder();
  const keys: string[] = [];
  f.respond(async (url, init) => {
    if (!String(url).endsWith('/messages')) return previous(url, init);
    keys.push(new Headers(init?.headers).get('Idempotency-Key')!);
    return Response.json({
      message: msg(13, { authorType: 'agent', authorId: credential.actorId, text: 'reply' }),
      replayed: keys.length > 1,
    });
  });
  const input = {
    accountRef: connection.id,
    fingerprint: connection.fingerprint,
    route: { conversationId: credential.channelId, messageId: '12', actorId: 'user_original' },
    text: 'reply',
    signal: new AbortController().signal,
    operationId: 'durable-outbox-0001',
    beforeSend: () => true,
  };
  await expect(provider.reply!(input)).resolves.toMatchObject({
    accepted: true,
    receipt: { messageId: '13' },
  });
  await provider.reply!(input);
  expect(keys[0]).toBe(keys[1]);
  expect(keys[0]).toMatch(/^host-[a-f0-9]{64}$/);
  await expect(provider.reply!({ ...input, beforeSend: () => false })).rejects.toMatchObject({
    disposition: 'not-started',
  });
  expect(keys).toHaveLength(2);
  f.respond(async (url, init) => {
    if (String(url).endsWith('/messages')) throw Error('SENSITIVE remote error');
    return previous(url, init);
  });
  await expect(provider.reply!(input)).rejects.toMatchObject({
    disposition: 'unknown',
    code: 'CLOUD_UNAVAILABLE',
  });
});
it('routes cloud work into the existing Source Event and Bot Inbox once, preserving delegated authorship on replay', async () => {
  const { createCore } = await import('../src/plugin.js');
  const { createBridgeMethods } = await import('../src/bridge/methods.js');
  const f = await fixture();
  const runs: unknown[] = [];
  const core = createCore({
    dshHome: createTempRoot('cloud-messaging-core-'),
    agents: {
      async runOrchestrator(run) {
        runs.push(run);
      },
      async runAssignment() {},
      requestAssignment() {
        return { delivery: 'steer' };
      },
      async stopAssignment() {},
      async close() {},
    },
  });
  const port = attachOperationalModule(core.operationalDatabase, 'messaging');
  const owner = new CloudConnections(
    port,
    () => f.ctx.credentials,
    new CloudTransport((...args) => f.responder()(...args)),
  );
  cleanup.push(async () => {
    core.externalMessaging.close();
    await core.runtime.close();
    await owner.close();
    core.operationalDatabase.close();
  });
  const methods = createBridgeMethods({
    registry: core.registry,
    channels: core.channels,
    runtime: core.runtime,
    states: core.states,
    cloudConnections: owner,
    ownership: core.ownership,
    roster: core.roster,
  });
  expect((await methods.cloudConnections({ operation: 'import', credential })).ok).toBe(true);
  owner.setPolicy(connection.id, 1, {
    allowedUsers: ['user_original'],
    forwardTargets: [],
    environment: 'host-b',
  });
  expect(
    await methods.cloudConnections({ operation: 'list', unexpected: credential.secret }),
  ).toMatchObject({ ok: false, error: { code: 'INVALID_CLOUD_INPUT' } });
  expect(core.registry.create({ slug: 'cloud-b', displayName: 'Cloud B' }).ok).toBe(true);
  const provider = createCloudProvider(owner);
  type Consumer = Parameters<NonNullable<typeof provider.consume>>[0];
  let consumer: Consumer | undefined;
  core.externalMessaging.register({
    ...provider,
    async consume(input) {
      consumer = input;
      return () => {};
    },
  });
  await core.externalMessaging.identity('cloud-b', {
    kind: 'bind',
    providerId: provider.id,
    accountRef: connection.id,
    fingerprint: connection.fingerprint,
  });
  await vi.waitFor(() => expect(consumer).toBeDefined());
  const now = new Date(Date.now() + 1000).toISOString();
  const requested = {
    ...work,
    createdAt: now,
    expiresAt: new Date(Date.parse(now) + 300000).toISOString(),
  };
  const message = msg(13, {
    createdAt: now,
    kind: 'work_request',
    payload: requested,
    authorType: 'agent',
    authorId: requested.delegation.actorId,
  });
  const previous = f.responder();
  f.respond(async (url, init) =>
    String(url).includes('/messages?')
      ? Response.json({ messages: [message], nextCursor: 13, hasMore: false })
      : previous(url, init),
  );
  await pollCloudPage(owner, consumer!);
  await core.runtime.whenIdle();
  const source = port.read((db) =>
    db
      .prepare(
        "SELECT source_event_id,payload_json FROM source_events WHERE source_kind='bridge-message'",
      )
      .all(),
  );
  expect(source).toHaveLength(1);
  const payload = JSON.parse(String(source[0]?.payload_json));
  expect(payload.external.event).toMatchObject({
    channel: 'tob',
    actor: { kind: 'agent', id: requested.delegation.actorId },
    cloudWork: requested,
  });
  const row = source[0]!;
  const replay = { ...payload.external.event, text: message.text };
  await consumer!.onEvent(replay, consumer!.signal);
  await core.runtime.whenIdle();
  expect(
    port.read((db) =>
      db
        .prepare("SELECT source_event_id FROM source_events WHERE source_kind='bridge-message'")
        .all(),
    ),
  ).toEqual([{ source_event_id: row.source_event_id }]);
  expect(runs).toHaveLength(1);
  await expect(
    consumer!.onEvent(
      { ...replay, cloudWork: { ...requested, requesterUserId: 'user_forged' } },
      consumer!.signal,
    ),
  ).rejects.toThrow();
});
it('denies Bot wake by default and uses the current local original-Human policy after a history read', async () => {
  const f = await fixture();
  await f.owner.import(credential);
  const previous = f.responder();
  const message = msg(13, {
    authorType: 'agent',
    authorId: work.delegation.actorId,
    kind: 'work_request',
    payload: work,
  });
  const onEvent = vi.fn(async (_event: MessagingInboundEvent) => ({ accepted: true as const }));
  f.respond(async (url, init) =>
    String(url).includes('/messages?')
      ? Response.json({ messages: [message], nextCursor: 13, hasMore: false })
      : previous(url, init),
  );
  await pollCloudPage(f.owner, {
    accountRef: connection.id,
    fingerprint: connection.fingerprint,
    signal: new AbortController().signal,
    onEvent,
  });
  expect(onEvent.mock.calls[0]?.[0].mentionedAccount).toBe(false);
  f.owner.setPolicy(connection.id, 1, {
    allowedUsers: ['user_original'],
    forwardTargets: [],
    environment: 'host-b',
  });
  f.respond(async (url, init) => {
    if (!String(url).includes('/messages?')) return previous(url, init);
    f.owner.setPolicy(connection.id, 2, {
      allowedUsers: [],
      forwardTargets: [],
      environment: 'host-b',
    });
    return Response.json({
      messages: [{ ...message, sequence: 14 }],
      nextCursor: 14,
      hasMore: false,
    });
  });
  await pollCloudPage(f.owner, {
    accountRef: connection.id,
    fingerprint: connection.fingerprint,
    signal: new AbortController().signal,
    onEvent,
  });
  expect(onEvent.mock.calls[1]?.[0].mentionedAccount).toBe(false);
});
it('keeps cloud work authorization above explicit ordinary-message wake and queued-source consumption', async () => {
  const { createCore } = await import('../src/plugin.js');
  const { sourceSenderAllowed } = await import('../src/messaging/sender-access.js');
  const f = await fixture();
  const runs: unknown[] = [];
  const core = createCore({
    dshHome: createTempRoot('cloud-wake-boundary-'),
    agents: {
      async runOrchestrator(run) {
        runs.push(run);
      },
      async runAssignment() {},
      requestAssignment() {
        return { delivery: 'steer' };
      },
      async stopAssignment() {},
      async close() {},
    },
  });
  const port = attachOperationalModule(core.operationalDatabase, 'messaging');
  const owner = new CloudConnections(
    port,
    () => f.ctx.credentials,
    new CloudTransport((...args) => f.responder()(...args)),
  );
  cleanup.push(async () => {
    core.externalMessaging.close();
    await core.runtime.close();
    await owner.close();
    core.operationalDatabase.close();
  });
  await owner.import(credential);
  core.registry.create({ slug: 'cloud-b', displayName: 'Cloud B' });
  core.registry.create({ slug: 'other-bot', displayName: 'Other Bot' });
  const provider = createCloudProvider(owner);
  type Consumer = Parameters<NonNullable<typeof provider.consume>>[0];
  let consumer: Consumer | undefined;
  core.externalMessaging.register({
    ...provider,
    async consume(input) {
      consumer = input;
      return () => {};
    },
  });
  await core.externalMessaging.identity('cloud-b', {
    kind: 'bind',
    providerId: provider.id,
    accountRef: connection.id,
    fingerprint: connection.fingerprint,
  });
  const grant = await core.externalMessaging.authorize({
    botSlug: 'cloud-b',
    providerId: provider.id,
    accountRef: connection.id,
    targetRef: credential.channelId,
    fingerprint: connection.fingerprint,
    targetDigest: connection.fingerprint,
  });
  await core.externalMessaging.inbound.setEnabled('cloud-b', grant.id, true);
  await vi.waitFor(() => expect(consumer).toBeDefined());
  const previous = f.responder();
  let sequence = 12;
  const deliver = async (overrides: Record<string, unknown> = {}) => {
    const message = msg(++sequence, { createdAt: new Date().toISOString(), ...overrides });
    f.respond(async (url, init) =>
      String(url).includes('/messages?')
        ? Response.json({ messages: [message], nextCursor: sequence, hasMore: false })
        : previous(url, init),
    );
    await pollCloudPage(owner, consumer!);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await core.runtime.whenIdle();
  };
  await deliver();
  await core.externalMessaging.inbound.setPolicy(
    'cloud-b',
    grant.id,
    { collection: 'all', wake: 'immediate', count: 1, intervalSeconds: 30 },
    { kind: 'human' },
  );
  await deliver();
  expect(runs).toHaveLength(0);
  const request = {
    ...work,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  };
  const typed = {
    kind: 'work_request',
    payload: request,
    authorType: 'agent',
    authorId: request.delegation.actorId,
  };
  await deliver(typed);
  expect(runs).toHaveLength(0);
  owner.setPolicy(connection.id, 1, {
    allowedUsers: ['user_original'],
    forwardTargets: [],
    environment: 'host-b',
  });
  await deliver({
    ...typed,
    payload: {
      ...request,
      createdAt: new Date(Date.now() - 120000).toISOString(),
      expiresAt: new Date(Date.now() - 60000).toISOString(),
    },
  });
  expect(runs).toHaveLength(0);
  await deliver(typed);
  expect(runs).toHaveLength(1);
  const source = port.read((db) =>
    db
      .prepare(
        "SELECT source_event_id FROM source_events WHERE source_kind='bridge-message' AND json_extract(payload_json,'$.external.event.eventId')=?",
      )
      .get(String(sequence)),
  ) as { source_event_id: string };
  expect(port.read((db) => sourceSenderAllowed(db, 'cloud-b', source.source_event_id))).toBe(true);
  expect(port.read((db) => sourceSenderAllowed(db, 'other-bot', source.source_event_id))).toBe(
    false,
  );
  owner.setPolicy(connection.id, 2, {
    allowedUsers: [],
    forwardTargets: [],
    environment: 'host-b',
  });
  expect(port.read((db) => sourceSenderAllowed(db, 'cloud-b', source.source_event_id))).toBe(false);
  expect(port.read((db) => sourceSenderAllowed(db, 'cloud-b', source.source_event_id, true))).toBe(
    true,
  );
  const group = core.channels.createGroup({
    name: 'Shared context',
    members: ['cloud-b', 'other-bot'],
  });
  for (const slug of group.members)
    core.channels.setGroupWakePolicy(group.id, slug, {
      mode: 'all',
      count: 1,
      intervalSeconds: 30,
    });
  await core.externalMessaging.inbound.setChannelTarget('cloud-b', grant.id, group.id);
  await deliver({ ...typed, text: 'Denied cloud work remains context only' });
  await deliver({ text: 'Ordinary cloud context never authorizes local work' });
  expect(runs).toHaveLength(1);
  expect(core.channels.readMessages(group.id).map((m) => m.body)).toContain(
    'Ordinary cloud context never authorizes local work',
  );
  await owner.remove(connection.id, 3);
  expect(port.read((db) => sourceSenderAllowed(db, 'cloud-b', source.source_event_id, true))).toBe(
    false,
  );
});
