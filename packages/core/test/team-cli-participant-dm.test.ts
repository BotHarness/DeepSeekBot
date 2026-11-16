import { createServer } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { createCore } from '../src/plugin.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createTempRoot } from './helpers.js';

const alice = humanContext('alice'),
  bob = humanContext('bob'),
  eve = humanContext('eve');
const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});
async function fixture() {
  const core = createCore({
    dshHome: createTempRoot('m7-cli-participant-'),
    agents: {
      async runOrchestrator(input) {
        if (!input.message.includes('no-reply')) await input.channels.send({ body: 'ACK' });
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('unexpected');
      },
      async close() {},
    },
  });
  closes.push(async () => {
    await core.runtime.close();
    core.schedules.close();
    core.externalMessaging.close();
    await core.roster.detach();
    core.operationalDatabase.close();
  });
  const db = attachOperationalModule(core.operationalDatabase, 'participant-cli-test');
  db.transaction((sql) => {
    sql.prepare('UPDATE team_settings SET enabled=1').run();
    for (const human of [alice, bob, eve]) {
      sql
        .prepare("INSERT INTO humans VALUES (?,?,'active','now')")
        .run(human.humanId, human.humanId);
      sql.prepare("INSERT INTO human_roles VALUES (?,'member')").run(human.humanId);
    }
  });
  core.spaces.ensureAccount('bob');
  expect(
    core.registry.create({
      slug: 'helper',
      displayName: 'Helper',
      ownerHumanId: 'bob',
      description: 'private settings',
      workspaces: ['/private/files'],
    }).ok,
  ).toBe(true);
  core.channels.getOrCreateDm(bob, 'helper');
  core.team.bots.setVisibility(owner, 'helper', {
    kind: 'public',
    audience: { kind: 'members', humanIds: ['alice'] },
  });
  const bridge = createBridgeMethodsForHumans(core);
  const requests: Array<{ username: string; method: string; args: Record<string, unknown> }> = [];
  const server = createServer(async (req, res) => {
    if (req.method === 'GET') {
      res.writeHead(302, { 'set-cookie': 'authority=test; HttpOnly', location: '/' }).end();
      return;
    }
    try {
      expect(req.headers.cookie).toBe('authority=test');
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const input = z
        .object({
          namespace: z.literal('botharness'),
          username: z.enum(['alice', 'bob', 'eve']),
          method: z.string(),
          args: z.record(z.string(), z.unknown()),
        })
        .parse(JSON.parse(Buffer.concat(chunks).toString()));
      expect(req.url).toBe('/api/botharness/team-as');
      requests.push(input);
      const methods = bridge(humanContext(input.username));
      const method: unknown = Reflect.get(methods, input.method);
      if (typeof method !== 'function') throw new Error('unknown method');
      const value: unknown = await Reflect.apply(method, methods, [input.args]);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(value));
    } catch {
      res.writeHead(500).end(JSON.stringify({ ok: false, error: { code: 'test-handler-failed' } }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closes.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  const invoke = async (username: 'alice' | 'bob' | 'eve', args: string[]) => {
    const stdout: string[] = [];
    const code = await runBotCreateCli([...args, '--as', username, '--timeout', '5'], {
      env: {
        DEEPSEEKBOT_HOST: `http://127.0.0.1:${address.port}`,
        DEEPSEEKBOT_HOST_TOKEN: 'test-token',
      },
      stdout: (value) => stdout.push(value),
      stderr: () => {},
    });
    expect(stdout).toHaveLength(1);
    const text = stdout[0]!;
    expect(text).not.toContain('test-token');
    const json: unknown = JSON.parse(text);
    return { code, json, text };
  };
  return { core, bridge, requests, invoke };
}
const receipt = z.object({ channelId: z.string(), messageId: z.string() });

it('resolves first --as send, receipt retries and send-status to the same participant DM', async () => {
  const f = await fixture(),
    messageId = 'human-11111111-1111-4111-8111-111111111111';
  const args = ['send', 'helper', '--body', 'hello', '--message-id', messageId];
  const sent = await f.invoke('alice', args);
  expect(sent.code).toBe(0);
  const result = z
    .object({
      receipt,
      state: z.literal('handled'),
      replies: z.array(z.object({ body: z.string() })),
    })
    .parse(sent.json);
  expect(result.receipt.channelId).not.toBe('dm-helper');
  expect(result.replies).toMatchObject([{ body: 'ACK' }]);
  expect(f.core.channels.readMessages('dm-helper')).toEqual([]);
  const status = await f.invoke('alice', ['send-status', 'helper', '--message-id', messageId]);
  expect(status.code).toBe(0);
  expect(status.json).toMatchObject({ state: 'handled', replies: [{ body: 'ACK' }] });
  const again = await f.invoke('alice', args);
  expect(again.code).toBe(0);
  expect(again.json).toMatchObject({ receipt: result.receipt });
  expect(
    f.core.channels
      .readMessages(result.receipt.channelId)
      .filter((message) => message.author.kind === 'human'),
  ).toHaveLength(1);
  expect(
    f.requests
      .filter(
        (request) =>
          request.username === 'alice' &&
          ['channelSend', 'channelSendStatus'].includes(request.method),
      )
      .every((request) => request.args['channelId'] === result.receipt.channelId),
  ).toBe(true);
  expect(f.requests.some((request) => request.method === 'get')).toBe(false);
  expect(
    f.requests.filter((request) => request.username === 'alice' && request.method === 'channelDm'),
  ).toHaveLength(3);
  const foreign = await f.invoke('bob', ['send-status', 'helper', '--message-id', messageId]);
  expect(foreign.code).not.toBe(0);
  expect(foreign.text).not.toContain('ACK');
});

it('retains the actual participant receipt when no reply was produced', async () => {
  const f = await fixture();
  const sent = await f.invoke('alice', ['send', 'helper', '--body', 'no-reply']);
  expect(sent.code).not.toBe(0);
  const result = z
    .object({ receipt, error: z.object({ code: z.literal('reply-not-produced') }) })
    .parse(sent.json);
  expect(result.receipt.channelId).not.toBe('dm-helper');
  const status = await f.invoke('alice', [
    'send-status',
    'helper',
    '--message-id',
    result.receipt.messageId,
  ]);
  expect(status.code).toBe(0);
  expect(status.json).toMatchObject({ state: 'handled', replies: [] });
});

it('reopens history after shrink, excludes it from reachability, and refuses writes and management', async () => {
  const f = await fixture();
  const sent = await f.invoke('alice', ['send', 'helper', '--body', 'history']);
  expect(sent.code).toBe(0);
  const result = z.object({ receipt }).parse(sent.json);
  await f.core.runtime.whenIdle();
  f.core.team.bots.setVisibility(
    bob,
    'helper',
    { kind: 'public', audience: { kind: 'members', humanIds: [] } },
    true,
  );
  const list = await f.invoke('alice', ['list']);
  expect(list.code).toBe(0);
  expect(list.json).toMatchObject({
    bots: [
      {
        slug: 'helper',
        sharedBy: { humanId: 'bob', displayName: 'bob' },
        metadataOnly: true,
        readOnly: true,
      },
    ],
  });
  for (const secret of ['private settings', '/private/files', 'memoryDir', 'modelPlan', 'sessions'])
    expect(list.text).not.toContain(secret);
  const reachable = await f.invoke('alice', ['bots', 'reachable']);
  expect(reachable.json).toEqual([]);
  const opened = await f.bridge(alice).channelDm({ slug: 'helper' });
  expect(opened).toMatchObject({
    ok: true,
    value: { channel: { id: result.receipt.channelId, readOnly: true } },
  });
  const messages = await f.invoke('alice', ['channel-messages', result.receipt.channelId]);
  expect(messages.code).toBe(0);
  expect(messages.json).toMatchObject({
    messages: expect.arrayContaining([expect.objectContaining({ body: 'ACK' })]),
  });
  const status = await f.invoke('alice', [
    'send-status',
    'helper',
    '--message-id',
    result.receipt.messageId,
  ]);
  expect(status.code).toBe(0);
  expect(status.json).toMatchObject({ state: 'handled', replies: [{ body: 'ACK' }] });
  const count = f.core.channels.readMessages(result.receipt.channelId).length;
  const refused = await f.invoke('alice', ['send', 'helper', '--body', 'refused']);
  expect(refused.json).toMatchObject({
    error: { code: 'bot-dm-read-only' },
    receipt: { channelId: result.receipt.channelId },
  });
  expect(f.core.channels.readMessages(result.receipt.channelId)).toHaveLength(count);
  for (const command of [
    ['show', 'helper'],
    ['model-plan', 'helper'],
    ['bot-avatar-set', 'helper', '--clear'],
    ['memory-snapshot', 'helper'],
    ['bot-session-usage', 'helper'],
    ['call-list', 'helper'],
  ])
    expect((await f.invoke('alice', command)).code, command.join(' ')).not.toBe(0);
  expect((await f.invoke('eve', ['list'])).json).toMatchObject({ bots: [] });
  const absent = await f.invoke('eve', ['send', 'helper', '--body', 'refused']);
  expect(absent.code).not.toBe(0);
  expect(absent.json).toMatchObject({ error: { code: 'bot-not-found' } });
  expect(absent.json).not.toHaveProperty('receipt');
  expect(f.core.channels.list().filter((channel) => channel.botSlug === 'helper')).toHaveLength(2);
});
