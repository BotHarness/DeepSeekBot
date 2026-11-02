import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

async function host(
  handler: (method: string, args: Record<string, unknown>) => unknown,
  stallBody = false,
) {
  const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  let logins = 0;
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET') {
      logins += 1;
      if (
        new URL(req.url!, 'http://localhost').searchParams.get('token') !== 'private-test-token'
      ) {
        res.writeHead(403).end();
        return;
      }
      if (logins % 2 === 0) res.setHeader('set-cookie', 'authority=signed; HttpOnly');
      res.writeHead(302, { location: '/' }).end();
      return;
    }
    expect(req.headers.cookie).toBe('authority=signed');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    expect(body.type).toBe('client-request');
    expect(req.url).toBe(`/api/${body.method}`);
    const method = body.method.replace('botharness/', '');
    const args = method.startsWith('dsh-im/') ? body.payload : body.payload.args;
    calls.push({ method, args });
    res.setHeader('content-type', 'application/json');
    if (stallBody) {
      res.write('{');
      return;
    }
    res.end(
      JSON.stringify({
        type: 'server-response',
        rpcId: body.rpcId,
        result: handler(method, args),
      }),
    );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  return { url: `http://127.0.0.1:${address.port}`, calls };
}

async function invoke(argv: string[], url?: string, stdin = '', token = 'private-test-token') {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBotCreateCli(argv, {
    env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: token },
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    readStdin: async () => stdin,
  });
  expect(stdout).toHaveLength(1);
  const out = stdout.join('');
  expect(out + stderr.join('')).not.toContain('private-test-token');
  return { code, text: out, json: JSON.parse(out) };
}

const BOT = 'ada';
const GRANT = '22222222-2222-4222-8222-222222222222';
const BINDING = '11111111-1111-4111-8111-111111111111';
const DELIVERY = '33333333-3333-4333-8333-333333333333';
const PAIRING = '44444444-4444-4444-8444-444444444444';

const APPS = {
  apps: [
    {
      ref: 'feishu_1',
      platform: 'feishu',
      name: 'Mascot',
      fingerprint: 'f'.repeat(64),
      connected: true,
      providerId: 'dsh-im/feishu',
    },
  ],
  setups: [],
};

const SNAPSHOT = {
  accounts: APPS.apps,
  identities: [
    {
      id: BINDING,
      accountRef: 'feishu_1',
      platform: 'feishu',
      revision: 4,
      postLimit: 3,
      postLimitRevision: 7,
    },
  ],
  grants: [
    {
      id: GRANT,
      bindingId: BINDING,
      platform: 'feishu',
      accountRef: 'feishu_1',
      targetRef: 'oc_group',
      targetName: 'QA group',
      targetDigest: 'd'.repeat(64),
      fingerprint: 'f'.repeat(64),
      revision: 2,
      availability: 'available',
      reception: 'receiving',
      canPost: true,
      groupPolicy: { collection: 'all', wake: 'digest', count: 5, intervalSeconds: 30 },
    },
  ],
  approvals: { routeRevision: 5, destinations: [], deliveries: [] },
  failureAlerts: { enabled: false, revision: 9, available: true, deliveries: [] },
  intents: [],
};

function snapshotHost(
  value: (method: string, args: Record<string, unknown>) => unknown = () => ({}),
) {
  return host((method, args) => ({
    ok: true,
    value:
      method === 'messagingSnapshot'
        ? SNAPSHOT
        : method === 'messagingApps'
          ? APPS
          : method === 'messagingTargets'
            ? { targets: [{ ref: 'oc_group', name: 'QA group', digest: 'd'.repeat(64) }] }
            : value(method, args),
  }));
}

describe('IM messaging commands', () => {
  it('reads and sets messaging defaults for one platform', async () => {
    const live = await snapshotHost(() => ({ platform: 'discord', revision: 2 }));
    const read = await invoke(['messaging-defaults', 'discord'], live.url);
    expect(read.code).toBe(0);
    expect(read.json).toEqual({ platform: 'discord', revision: 2 });
    const policy = {
      expectedRevision: 1,
      collection: 'mentions',
      wake: 'digest',
      count: 5,
      intervalSeconds: 30,
      identityEnabled: true,
    };
    await invoke(
      ['messaging-defaults-set', 'discord', '--input-stdin'],
      live.url,
      JSON.stringify({ ...policy, platform: 'slack' }),
    );
    expect(live.calls).toEqual([
      { method: 'messagingDefaults', args: { platform: 'discord' } },
      { method: 'messagingDefaultsSet', args: { input: { ...policy, platform: 'discord' } } },
    ]);
    for (const [argv, stdin] of [
      [['messaging-defaults', 'telegram'], ''],
      [['messaging-defaults-set', 'discord'], '{}'],
      [['messaging-defaults-set', 'discord', '--input-stdin'], '[1]'],
      [['messaging-defaults-set', 'discord', '--input-stdin'], 'nope'],
    ] as const)
      expect((await invoke([...argv], live.url, stdin)).json.error.code).toBe('usage');
    expect(live.calls).toHaveLength(2);
  });

  it('lists grants and authorizes a target by its reachable digest', async () => {
    const live = await snapshotHost(() => ({ grant: { id: GRANT } }));
    const grants = await invoke(['messaging-grants', BOT], live.url);
    expect(grants.json.grants[0]).toMatchObject({
      id: GRANT,
      bindingId: BINDING,
      name: 'QA group',
      revision: 2,
      canPost: true,
      channelId: null,
    });
    expect(grants.json.bindings).toEqual([
      { id: BINDING, app: 'feishu_1', platform: 'feishu', postLimit: 3, postLimitRevision: 7 },
    ]);
    expect(grants.text).not.toContain('d'.repeat(64));
    const targets = await invoke(['messaging-targets', 'feishu_1'], live.url);
    expect(targets.json.targets[0].ref).toBe('oc_group');
    await invoke(
      ['messaging-authorize', BOT, '--app', 'feishu_1', '--target', 'oc_group'],
      live.url,
    );
    expect(live.calls.at(-1)).toEqual({
      method: 'messagingAuthorize',
      args: {
        botSlug: BOT,
        providerId: 'dsh-im/feishu',
        accountRef: 'feishu_1',
        targetRef: 'oc_group',
        fingerprint: 'f'.repeat(64),
        targetDigest: 'd'.repeat(64),
      },
    });
    expect(
      (
        await invoke(
          ['messaging-authorize', BOT, '--app', 'feishu_1', '--target', 'oc_x'],
          live.url,
        )
      ).json.error.code,
    ).toBe('unknown-target');
    expect((await invoke(['messaging-targets', 'missing'], live.url)).json.error.code).toBe(
      'unknown-app',
    );
  });

  it('needs --confirm to revoke, block or delete, matching the Web UI confirmation', async () => {
    const live = await snapshotHost(() => ({ updated: true, revoked: true }));
    const refusals: [string[], string][] = [
      [['messaging-revoke', BOT, '--grant', GRANT], ''],
      [
        ['messaging-conversation', BOT, '--input-stdin'],
        JSON.stringify({ kind: 'block', grantId: GRANT, expectedRevision: 2 }),
      ],
      [
        ['channel-bridge', 'group-lab', '--input-stdin'],
        JSON.stringify({
          kind: 'delete',
          grantId: GRANT,
          expectedGrantRevision: 2,
          expectedRevision: 1,
        }),
      ],
      [
        ['sender-access', BOT, '--input-stdin'],
        JSON.stringify({ kind: 'delete-group', id: GRANT }),
      ],
    ];
    for (const [argv, stdin] of refusals) {
      const refused = await invoke(argv, live.url, stdin);
      expect(refused.code).not.toBe(0);
      expect(refused.json.error.code).toBe('usage');
    }
    expect(live.calls).toEqual([]);
    for (const [argv, stdin] of refusals)
      expect((await invoke([...argv, '--confirm'], live.url, stdin)).code).toBe(0);
    expect(live.calls.map((call) => call.method)).toEqual([
      'messagingRevoke',
      'messagingConversation',
      'channelBridge',
      'senderAccess',
    ]);
    expect(live.calls[0]!.args).toEqual({ slug: BOT, grantId: GRANT });
    expect(live.calls[2]!.args).toEqual({
      channelId: 'group-lab',
      input: { kind: 'delete', grantId: GRANT, expectedGrantRevision: 2, expectedRevision: 1 },
    });
  });

  it('sets receive, Channel target, group, thread and conversation policies', async () => {
    const live = await snapshotHost(() => ({ updated: true }));
    const group = { collection: 'all', wake: 'immediate', count: 1, intervalSeconds: 10 };
    const thread = { mode: 'follow', expectedRevision: 0, wake: null };
    await invoke(['messaging-receive', BOT, '--grant', GRANT, '--disabled'], live.url);
    await invoke(
      ['messaging-channel-target', BOT, '--grant', GRANT, '--channel', 'group-lab'],
      live.url,
    );
    await invoke(
      ['messaging-channel-target', BOT, '--grant', GRANT, '--channel', 'none'],
      live.url,
    );
    await invoke(
      ['messaging-group-policy', BOT, '--grant', GRANT, '--input-stdin'],
      live.url,
      JSON.stringify(group),
    );
    await invoke(
      ['messaging-thread-policy', BOT, '--source', 'src-1', '--input-stdin'],
      live.url,
      JSON.stringify(thread),
    );
    await invoke(['messaging-source', BOT, '--source', 'src-1'], live.url);
    await invoke(
      ['messaging-conversation', BOT, '--input-stdin'],
      live.url,
      JSON.stringify({ kind: 'mute', grantId: GRANT, expectedRevision: 2, muted: true }),
    );
    expect(live.calls).toEqual([
      { method: 'messagingReceive', args: { slug: BOT, grantId: GRANT, enabled: false } },
      {
        method: 'messagingChannelTarget',
        args: { slug: BOT, grantId: GRANT, channelId: 'group-lab' },
      },
      { method: 'messagingChannelTarget', args: { slug: BOT, grantId: GRANT, channelId: null } },
      { method: 'messagingGroupPolicy', args: { slug: BOT, grantId: GRANT, policy: group } },
      {
        method: 'messagingThreadPolicy',
        args: { slug: BOT, sourceEventId: 'src-1', policy: thread },
      },
      { method: 'messagingSource', args: { slug: BOT, sourceEventId: 'src-1' } },
      {
        method: 'messagingConversation',
        args: {
          slug: BOT,
          input: { kind: 'mute', grantId: GRANT, expectedRevision: 2, muted: true },
        },
      },
    ]);
    for (const argv of [
      ['messaging-receive', BOT, '--grant', GRANT],
      ['messaging-receive', BOT, '--grant', 'not-a-uuid', '--enabled'],
      ['messaging-source', BOT],
      ['messaging-source', BOT, '--source', 'x', '--input-stdin'],
    ])
      expect((await invoke(argv, live.url, '{}')).json.error.code).toBe('usage');
  });

  it('posts proactively with a stable request id, reads it back and sets the post limit', async () => {
    const live = await snapshotHost((method, args) =>
      method === 'messagingPostLimit'
        ? { identity: { id: BINDING, postLimit: args['limit'] } }
        : { intent: { id: 'intent-1', text: args['text'], state: 'pending' } },
    );
    const reachable = await invoke(
      ['messaging-reachable', BOT, '--binding', BINDING, '--cursor', 'c1'],
      live.url,
    );
    expect(reachable.code).toBe(0);
    const posted = await invoke(
      [
        'messaging-post',
        BOT,
        '--binding',
        BINDING,
        '--conversation',
        'oc_group',
        '--body-stdin',
        '--request-id',
        'qa-post-0001',
      ],
      live.url,
      'hello group',
    );
    expect(posted.json).toEqual({
      requestId: 'qa-post-0001',
      intent: { id: 'intent-1', text: 'hello group', state: 'pending' },
    });
    await invoke(
      [
        'messaging-post-status',
        BOT,
        '--binding',
        BINDING,
        '--conversation',
        'oc_group',
        '--body',
        'hello group',
        '--request-id',
        'qa-post-0001',
      ],
      live.url,
    );
    const sent = await invoke(['messaging-send', BOT, '--grant', GRANT, '--body', 'hi'], live.url);
    expect(sent.json.requestId).toMatch(/^cli-[0-9a-f-]{36}$/u);
    await invoke(['messaging-post-limit', BOT, '--binding', BINDING, '--limit', '5'], live.url);
    await invoke(['messaging-post-limit', BOT, '--binding', BINDING, '--limit', 'none'], live.url);
    const post = {
      slug: BOT,
      bindingId: BINDING,
      conversationId: 'oc_group',
      requestId: 'qa-post-0001',
      text: 'hello group',
    };
    expect(live.calls).toEqual([
      { method: 'messagingReachable', args: { slug: BOT, bindingId: BINDING, cursor: 'c1' } },
      { method: 'messagingPostConversation', args: post },
      { method: 'messagingPostRequest', args: post },
      {
        method: 'messagingSend',
        args: { slug: BOT, grantId: GRANT, requestId: sent.json.requestId, text: 'hi' },
      },
      { method: 'messagingSnapshot', args: { slug: BOT } },
      {
        method: 'messagingPostLimit',
        args: { slug: BOT, bindingId: BINDING, expectedRevision: 7, limit: 5 },
      },
      { method: 'messagingSnapshot', args: { slug: BOT } },
      {
        method: 'messagingPostLimit',
        args: { slug: BOT, bindingId: BINDING, expectedRevision: 7, limit: null },
      },
    ]);
    for (const argv of [
      ['messaging-post', BOT, '--binding', BINDING, '--conversation', 'oc_group'],
      ['messaging-post', BOT, '--binding', BINDING, '--body', 'x'],
      [
        'messaging-post',
        BOT,
        '--binding',
        BINDING,
        '--conversation',
        'c',
        '--body',
        'x',
        '--request-id',
        'short',
      ],
      ['messaging-post-status', BOT, '--binding', BINDING, '--conversation', 'c', '--body', 'x'],
      ['messaging-post-limit', BOT, '--binding', BINDING, '--limit', '0'],
      ['messaging-send', BOT, '--grant', GRANT, '--body', ' '],
    ])
      expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
    expect(
      (
        await invoke(
          [
            'messaging-post-limit',
            BOT,
            '--binding',
            '55555555-5555-4555-8555-555555555555',
            '--limit',
            '1',
          ],
          live.url,
        )
      ).json.error.code,
    ).toBe('unknown-binding');
  });

  it('routes, tests and retries approvals and failure alerts with the current revisions', async () => {
    const live = await snapshotHost((method) =>
      method.endsWith('Test') || method.endsWith('Retry')
        ? { delivery: { id: DELIVERY, state: 'provider-accepted' } }
        : { updated: true },
    );
    expect((await invoke(['approval-routes', BOT], live.url)).json.routeRevision).toBe(5);
    expect((await invoke(['failure-alerts', BOT], live.url)).json.revision).toBe(9);
    await invoke(['approval-route', BOT, '--pairing', PAIRING], live.url);
    await invoke(['approval-route', BOT, '--pairing', 'none'], live.url);
    const tested = await invoke(['approval-test', BOT], live.url);
    expect(tested.json.delivery.id).toBe(DELIVERY);
    await invoke(['approval-retry', BOT, '--delivery', DELIVERY], live.url);
    await invoke(['failure-alerts-set', BOT, '--enabled'], live.url);
    await invoke(['failure-alerts-test', BOT], live.url);
    await invoke(['failure-alerts-retry', BOT, '--delivery', DELIVERY], live.url);
    expect(live.calls.filter((call) => call.method !== 'messagingSnapshot')).toEqual([
      { method: 'approvalRoute', args: { slug: BOT, pairingId: PAIRING, expectedRevision: 5 } },
      { method: 'approvalRoute', args: { slug: BOT, pairingId: null, expectedRevision: 5 } },
      { method: 'approvalTest', args: { slug: BOT } },
      { method: 'approvalRetry', args: { slug: BOT, id: DELIVERY } },
      { method: 'failureAlertsSet', args: { slug: BOT, enabled: true, expectedRevision: 9 } },
      { method: 'failureAlertsTest', args: { slug: BOT } },
      { method: 'failureAlertsRetry', args: { slug: BOT, id: DELIVERY } },
    ]);
    for (const argv of [
      ['approval-route', BOT],
      ['approval-retry', BOT],
      ['failure-alerts-set', BOT],
      ['failure-alerts-retry', BOT, '--delivery', 'x'],
    ])
      expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
  });

  it('passes independent default-off DM controls through the existing channel bridge command', async () => {
    const live = await snapshotHost(() => ({ updated: true }));
    for (const [dmMirror, dmForward] of [
      [false, false],
      [true, false],
      [false, true],
    ]) {
      const input = {
        kind: 'update',
        grantId: GRANT,
        routeId: 'inbox',
        expectedGrantRevision: 2,
        expectedRevision: 1,
        delivery: 'inbox',
        name: 'Owner',
        enabled: true,
        collection: 'all',
        collectionInheritance: 'custom',
        dmMirror,
        dmForward,
      };
      const result = await invoke(
        ['channel-bridge', 'dm-ada', '--input-stdin'],
        live.url,
        JSON.stringify(input),
      );
      expect(result.code).toBe(0);
      expect(live.calls.at(-1)).toEqual({
        method: 'channelBridge',
        args: { channelId: 'dm-ada', input },
      });
    }
  });

  it("reports the Host's refusal code and lists Channel bridges", async () => {
    const refused = await host(() => ({
      ok: false,
      error: { code: 'approval-route-changed', message: 'Refresh and try again.' },
    }));
    const failed = await invoke(['approval-test', BOT], refused.url);
    expect(failed.code).not.toBe(0);
    expect(failed.json.error.code).toBe('approval-route-changed');
    const live = await snapshotHost(() => ({ channelId: 'group-lab', bridges: [], sources: [] }));
    const bridges = await invoke(['channel-bridges', 'group-lab'], live.url);
    expect(bridges.json).toEqual({ channelId: 'group-lab', bridges: [], sources: [] });
    expect(live.calls).toEqual([{ method: 'channelBridges', args: { channelId: 'group-lab' } }]);
  });
});

it('imports a cloud Agent only from stdin over authenticated Host RPC and keeps secrets out of output', async () => {
  const live = await host((method, args) => {
    expect(method).toBe('cloudConnections');
    expect(args.input).toMatchObject({
      operation: 'import',
      credential: { secret: 'c'.repeat(64) },
    });
    return { ok: true, value: { connections: [{ active: true, revision: 1 }] } };
  });
  const { publicInstance } = await import('../src/cloud/instance-contract.js');
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
    operationId: 'cli-import-test-0001',
    secret: 'c'.repeat(64),
  };
  const result = await invoke(
    ['cloud', 'import', '--input-stdin'],
    live.url,
    JSON.stringify(credential),
  );
  expect(result.code, result.text).toBe(0);
  expect(result.text).not.toContain(credential.secret);
  expect(live.calls).toHaveLength(1);
  const invalid = await invoke(
    ['cloud', 'import', '--input-stdin'],
    live.url,
    JSON.stringify({ ...credential, secret: 'canary-invalid-secret' }),
  );
  expect(invalid.code).toBe(1);
  expect(invalid.text).not.toContain('canary-invalid-secret');
  expect(live.calls).toHaveLength(1);
});
it('cloud list and revisioned policy/removal use the same owner, requiring explicit removal confirmation', async () => {
  const live = await host((_method, args) => ({
    ok: true,
    value: { connections: [], operation: args.input },
  }));
  const id = 'cloud-' + 'a'.repeat(64);
  const listed = await invoke(['cloud', 'list'], live.url);
  expect(listed.code, listed.text).toBe(0);
  expect(
    (
      await invoke(
        ['cloud', 'policy', '--input-stdin'],
        live.url,
        JSON.stringify({
          id,
          revision: 2,
          policy: { allowedUsers: [], forwardTargets: [], environment: 'host-a' },
        }),
      )
    ).code,
  ).toBe(0);
  expect(
    (
      await invoke(
        ['cloud', 'remove', '--input-stdin'],
        live.url,
        JSON.stringify({ id, revision: 2 }),
      )
    ).code,
  ).toBe(2);
  expect(live.calls).toHaveLength(2);
  expect(
    (
      await invoke(
        ['cloud', 'remove', '--input-stdin', '--confirm'],
        live.url,
        JSON.stringify({ id, revision: 2 }),
      )
    ).code,
  ).toBe(0);
  expect(live.calls[2]?.args).toEqual({
    input: { operation: 'remove', id, revision: 2, confirm: true },
  });
});

it('runs cloud_work through authenticated CLI parity and refuses caller-supplied authority before contacting Host', async () => {
  const input = { operation: 'execute', source_event_id: 'im-' + 'a'.repeat(64) };
  const live = await host((method, args) => {
    expect(method).toBe('cloudWork');
    expect(args).toEqual({ slug: 'cloud-a', input });
    return { ok: true, value: { state: 'finished', executed: 1 } };
  });
  const result = await invoke(
    ['cloud-work', 'cloud-a', '--input-stdin'],
    live.url,
    JSON.stringify(input),
  );
  expect(result.code, result.text).toBe(0);
  expect(result.json).toEqual({ state: 'finished', executed: 1 });
  const bad = await invoke(
    ['cloud-work', 'cloud-a', '--input-stdin'],
    live.url,
    JSON.stringify({ ...input, requesterUserId: 'canary-authority' }),
  );
  expect(bad.code).toBe(1);
  expect(bad.text).not.toContain('canary-authority');
  expect(live.calls).toHaveLength(1);
});
