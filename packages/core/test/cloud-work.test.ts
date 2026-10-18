import { Context } from '@deepseek-ai/cordis';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { CloudConnections } from '../src/cloud/connections.js';
import { CloudTransport } from '../src/cloud/transport.js';
import { publicInstance } from '../src/cloud/instance-contract.js';
import { createCloudProvider, pollCloudPage } from '../src/cloud/provider.js';
import { CloudWork, parseCloudWork } from '../src/cloud/work.js';
import { createCloudWorkTool, runCloudWorkDirect } from '../src/cloud/work-tool.js';
import { createBridgeMethods } from '../src/bridge/methods.js';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function fixture() {
  const root = createTempRoot('cloud-work-'),
    ctx = new Context();
  const fiber = ctx.plugin(LocalCredentialProvider, {
    path: join(root, '.credentials.yaml'),
    watch: false,
  });
  await fiber.await();
  const core = createCore({
    dshHome: root,
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      requestAssignment() {
        return { delivery: 'steer' };
      },
      async stopAssignment() {},
      async close() {},
    },
  });
  const port = attachOperationalModule(core.operationalDatabase, 'messaging');
  const config = publicInstance({
    instanceId: 'uat-test',
    environment: 'uat',
    server: 'https://uat.example.test',
    clientId: 'client_test',
    issuer: 'https://api.workos.com/user_management/client_test',
    authkitDomain: 'test-staging.authkit.app',
  });
  const credential = {
    version: 1,
    config,
    organizationId: 'org_test',
    channelId: 'ch_' + 'a'.repeat(64),
    actorId: 'ag_' + 'b'.repeat(64),
    ownerUserId: 'user_owner',
    name: 'Test',
    operationId: 'cloud-work-import-0001',
    secret: 'c'.repeat(64),
  };
  const target = 'ag_' + 'd'.repeat(64),
    createdAt = new Date(Date.now() + 1000).toISOString();
  const request = {
    version: 1,
    requestId: 'wr_' + 'e'.repeat(64),
    channelId: credential.channelId,
    requesterUserId: 'user_original',
    targetActorId: credential.actorId,
    capability: 'health-check',
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + 300000).toISOString(),
  };
  const forwarded = {
    ...request,
    requestId: 'wr_' + 'f'.repeat(64),
    targetActorId: target,
    delegation: { parentRequestId: request.requestId, actorId: credential.actorId, hops: 1 },
  };
  const message = {
    sequence: 13,
    authorType: 'human',
    authorId: request.requesterUserId,
    text: 'Fixed health request',
    createdAt,
    kind: 'work_request',
    payload: request,
  };
  const calls: string[] = [];
  let override:
    | ((path: string, init?: RequestInit) => Response | undefined | Promise<Response | undefined>)
    | undefined;
  const connections = new CloudConnections(
    port,
    () => ctx.credentials,
    new CloudTransport(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/.well-known/open-cloud-groups')) return Response.json(config);
      calls.push(path);
      const replaced = await override?.(path, init);
      if (replaced) return replaced;
      if (path.endsWith('/identity'))
        return Response.json({
          organizationId: credential.organizationId,
          channelId: credential.channelId,
          agent: {
            actorId: credential.actorId,
            ownerUserId: credential.ownerUserId,
            name: 'Test',
            kind: 'agent',
            state: 'active',
            historyAfter: 12,
          },
        });
      if (path.endsWith('/messages'))
        return Response.json({ messages: [message], nextCursor: 13, hasMore: false });
      if (path.endsWith('/authorize')) return Response.json({ request });
      if (path.endsWith('/forward'))
        return Response.json({
          message: {
            ...message,
            sequence: 14,
            authorType: 'agent',
            authorId: credential.actorId,
            payload: forwarded,
          },
          replayed: false,
        });
      if (path.endsWith('/result'))
        return Response.json({
          message: {
            ...message,
            sequence: 15,
            authorType: 'agent',
            authorId: credential.actorId,
            kind: 'work_result',
            payload: JSON.parse(String(init?.body)),
          },
        });
      throw Error('UNEXPECTED_TEST_PATH');
    }),
  );
  const imported = await connections.import(credential),
    id = imported.connection.id;
  connections.setPolicy(id, 1, {
    allowedUsers: [request.requesterUserId],
    forwardTargets: [target],
    environment: 'test-host',
  });
  core.registry.create({ slug: 'cloud-a', displayName: 'Cloud A' });
  const provider = createCloudProvider(connections);
  let consumer: Parameters<NonNullable<typeof provider.consume>>[0] | undefined;
  core.externalMessaging.register({
    ...provider,
    async consume(input) {
      consumer = input;
      return () => {};
    },
  });
  await core.externalMessaging.identity('cloud-a', {
    kind: 'bind',
    providerId: provider.id,
    accountRef: id,
    fingerprint: imported.connection.fingerprint,
  });
  await vi.waitFor(() => expect(consumer).toBeDefined());
  await pollCloudPage(connections, consumer!);
  await core.runtime.whenIdle();
  const sourceId = port.read((db) =>
    db
      .prepare("SELECT source_event_id FROM source_events WHERE source_kind='bridge-message'")
      .get(),
  )!.source_event_id as string;
  const diagnose = vi.fn(() => ({ platform: 'test', architecture: 'test', runtime: 'v24' }));
  const make = () =>
    new CloudWork(
      port,
      connections,
      core.externalMessaging.inbound,
      (slug) => {
        const bot = core.registry.get(slug);
        return !!bot && !bot.paused;
      },
      () => {},
      diagnose,
    );
  const owner = make();
  cleanup.push(async () => {
    owner.close();
    core.externalMessaging.close();
    await core.runtime.close();
    await connections.close();
    core.operationalDatabase.close();
    await fiber.dispose();
  });
  const execute = () =>
    runCloudWorkDirect(owner, 'cloud-a', { operation: 'execute', source_event_id: sourceId });
  const forward = () =>
    runCloudWorkDirect(owner, 'cloud-a', {
      operation: 'forward',
      source_event_id: sourceId,
      target_actor_id: target,
    });
  return {
    core,
    port,
    connections,
    id,
    sourceId,
    request,
    forwarded,
    target,
    owner,
    make,
    diagnose,
    calls,
    execute,
    forward,
    override: (fn: typeof override) => {
      override = fn;
    },
  };
}
it('runs the native Tool through the direct RPC and records exactly one execution across concurrent calls and owner restart', async () => {
  const f = await fixture();
  const methods = createBridgeMethods({
    registry: f.core.registry,
    channels: f.core.channels,
    runtime: f.core.runtime,
    states: f.core.states,
    cloudWork: f.owner,
    ownership: f.core.ownership,
    roster: f.core.roster,
  });
  const inspected = await methods.cloudWork({
    slug: 'cloud-a',
    input: { operation: 'inspect', source_event_id: f.sourceId },
  });
  expect(inspected).toMatchObject({
    ok: true,
    value: { state: 'pending', request: f.request, forwardTargets: [f.target] },
  });
  const results = await Promise.all([f.execute(), f.execute()]);
  expect(results).toMatchObject([
    { executed: 1, result: { state: 'completed' } },
    { executed: 0, replayed: true },
  ]);
  expect(f.diagnose).toHaveBeenCalledTimes(1);
  f.owner.close();
  const restarted = f.make();
  await expect(
    runCloudWorkDirect(restarted, 'cloud-a', { operation: 'execute', source_event_id: f.sourceId }),
  ).resolves.toMatchObject({ executed: 0, replayed: true });
  restarted.close();
  expect(f.calls.filter((p) => p.endsWith('/authorize'))).toHaveLength(1);
  expect(f.calls.filter((p) => p.endsWith('/result'))).toHaveLength(1);
});
it('retries an uncertain result after expiry without repeating the local work', async () => {
  const f = await fixture();
  let fail = true;
  f.override((path) => {
    if (path.endsWith('/result') && fail) throw Error('SENSITIVE_NETWORK_MESSAGE');
  });
  await expect(f.execute()).rejects.toThrow('CLOUD_UNAVAILABLE');
  expect(f.diagnose).toHaveBeenCalledTimes(1);
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(f.request.expiresAt) + 1);
  fail = false;
  await expect(f.execute()).resolves.toMatchObject({ executed: 0, result: { state: 'completed' } });
  expect(f.diagnose).toHaveBeenCalledTimes(1);
});
it('never executes a request interrupted after its durable execution claim', async () => {
  const f = await fixture();
  f.diagnose.mockImplementationOnce(() => {
    throw Error('interrupted');
  });
  await expect(f.execute()).rejects.toThrow('interrupted');
  f.owner.close();
  const restarted = f.make();
  await expect(
    runCloudWorkDirect(restarted, 'cloud-a', { operation: 'execute', source_event_id: f.sourceId }),
  ).resolves.toMatchObject({
    executed: 0,
    result: { state: 'needs-review', reason: 'INTERRUPTED_EXECUTION' },
  });
  restarted.close();
  expect(f.diagnose).toHaveBeenCalledTimes(1);
});
it('keeps forwarding intent and target after uncertainty, refusing execute fallback and another target', async () => {
  const f = await fixture();
  let fail = true;
  f.override((path) => {
    if (path.endsWith('/forward') && fail) throw Error('unknown delivery');
  });
  await expect(f.forward()).rejects.toThrow('CLOUD_UNAVAILABLE');
  await expect(f.execute()).rejects.toThrow('CLOUD_WORK_CONFLICT');
  const policy = f.connections.get(f.id);
  f.connections.setPolicy(f.id, policy.revision, {
    ...policy.policy,
    forwardTargets: [f.target, 'ag_' + '9'.repeat(64)],
  });
  await expect(
    runCloudWorkDirect(f.owner, 'cloud-a', {
      operation: 'forward',
      source_event_id: f.sourceId,
      target_actor_id: 'ag_' + '9'.repeat(64),
    }),
  ).rejects.toThrow('CLOUD_WORK_CONFLICT');
  fail = false;
  await expect(f.forward()).resolves.toMatchObject({ state: 'forwarded', request: f.forwarded });
  await expect(f.forward()).resolves.toMatchObject({ replayed: true });
  expect(f.diagnose).not.toHaveBeenCalled();
  expect(f.calls.filter((p) => p.endsWith('/forward'))).toHaveLength(2);
});
it('rechecks original Human policy after remote authorization and cannot execute using another Bot', async () => {
  const f = await fixture();
  f.core.registry.create({ slug: 'other', displayName: 'Other' });
  await expect(
    runCloudWorkDirect(f.owner, 'other', { operation: 'execute', source_event_id: f.sourceId }),
  ).rejects.toThrow('CLOUD_WORK_SOURCE_UNAVAILABLE');
  f.override((path) => {
    if (path.endsWith('/authorize')) {
      const c = f.connections.get(f.id);
      f.connections.setPolicy(f.id, c.revision, { ...c.policy, allowedUsers: [] });
    }
  });
  await expect(f.execute()).rejects.toThrow('CLOUD_AUTHORITY_CHANGED');
  expect(f.diagnose).not.toHaveBeenCalled();
  expect(f.calls.filter((p) => p.endsWith('/result'))).toHaveLength(0);
});
it('refuses source/caller fabrication and cannot turn inspection into a shell operation', async () => {
  const f = await fixture();
  expect(() =>
    parseCloudWork({
      operation: 'execute',
      source_event_id: f.sourceId,
      requesterUserId: 'user_owner',
    }),
  ).toThrow('INVALID_CLOUD_WORK');
  await expect(
    runCloudWorkDirect(f.owner, 'cloud-a', {
      operation: 'execute',
      source_event_id: 'a'.repeat(36),
    }),
  ).rejects.toThrow('CLOUD_WORK_SOURCE_UNAVAILABLE');
  const tool = createCloudWorkTool(f.owner, 'cloud-a', () => false);
  await expect(
    tool.execute({ operation: 'execute', source_event_id: f.sourceId }, {} as never),
  ).rejects.toThrow('CLOUD_WORK_CALLER_DENIED');
  expect(f.diagnose).not.toHaveBeenCalled();
});
it('reports expiry without execution and rejects a changed canonical authorization response', async () => {
  const f = await fixture();
  f.override((path) =>
    path.endsWith('/authorize')
      ? Response.json({ request: { ...f.request, requesterUserId: 'user_spoofed' } })
      : undefined,
  );
  await expect(f.execute()).rejects.toThrow('CLOUD_WORK_CONFLICT');
  expect(f.diagnose).not.toHaveBeenCalled();
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(f.request.expiresAt) + 1);
  await expect(f.execute()).resolves.toMatchObject({
    executed: 0,
    result: { state: 'rejected', reason: 'REQUEST_EXPIRED' },
  });
  expect(f.diagnose).not.toHaveBeenCalled();
});
it('refuses a paused Bot before work and a forward target revoked during transmission', async () => {
  const f = await fixture();
  f.core.registry.setPaused('cloud-a', true);
  await expect(f.execute()).rejects.toThrow('CLOUD_WORK_SOURCE_UNAVAILABLE');
  f.core.registry.setPaused('cloud-a', false);
  f.override((path) => {
    if (path.endsWith('/forward')) {
      const c = f.connections.get(f.id);
      f.connections.setPolicy(f.id, c.revision, { ...c.policy, forwardTargets: [] });
    }
  });
  await expect(f.forward()).rejects.toThrow('CLOUD_AUTHORITY_CHANGED');
  expect(f.diagnose).not.toHaveBeenCalled();
  const c = f.connections.get(f.id);
  f.connections.setPolicy(f.id, c.revision, { ...c.policy, forwardTargets: [f.target] });
  await expect(f.execute()).rejects.toThrow('CLOUD_WORK_CONFLICT');
  f.override(undefined);
  await expect(f.forward()).resolves.toMatchObject({ state: 'forwarded' });
});
it('does not accept a mismatched result receipt or repeat its already completed effect', async () => {
  const f = await fixture();
  f.override((path, init) =>
    path.endsWith('/result')
      ? Response.json({
          message: {
            kind: 'work_result',
            authorType: 'agent',
            authorId: f.target,
            payload: JSON.parse(String(init?.body)),
          },
        })
      : undefined,
  );
  await expect(f.execute()).rejects.toThrow('INVALID_CLOUD_WORK_RESPONSE');
  expect(f.diagnose).toHaveBeenCalledTimes(1);
  f.override(undefined);
  await expect(f.execute()).resolves.toMatchObject({ executed: 0, result: { state: 'completed' } });
  expect(f.diagnose).toHaveBeenCalledTimes(1);
});
it('cannot execute again if another durable claim wins after authorization', async () => {
  const f = await fixture();
  f.override((path) => {
    if (path.endsWith('/authorize'))
      f.port.transaction((db) =>
        db
          .prepare("UPDATE cloud_work SET state='started',execution_count=1 WHERE request_id=?")
          .run(f.request.requestId),
      );
  });
  await expect(f.execute()).rejects.toThrow('CLOUD_WORK_CONFLICT');
  expect(f.diagnose).not.toHaveBeenCalled();
  await expect(f.execute()).resolves.toMatchObject({ result: { state: 'needs-review' } });
});
