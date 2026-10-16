import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { createChallenge, verifySolution } from '../src/marketplace/altcha.js';
import { createReleaseService } from '../src/release/service.js';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
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
  handler: (method: string, args: Record<string, unknown>) => unknown | Promise<unknown>,
) {
  const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET') {
      if (
        new URL(req.url!, 'http://localhost').searchParams.get('token') !== 'private-test-token'
      ) {
        res.writeHead(403).end();
        return;
      }
      res.setHeader('set-cookie', 'authority=signed; HttpOnly');
      res.writeHead(302, { location: '/' }).end();
      return;
    }
    expect(req.headers.cookie).toBe('authority=signed');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const method = body.method.replace('botharness/', '');
    calls.push({ method, args: body.payload.args });
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        type: 'server-response',
        rpcId: body.rpcId,
        result: await handler(method, body.payload.args),
      }),
    );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  return { url: `http://127.0.0.1:${address.port}`, calls };
}

async function invoke(argv: string[], url: string) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBotCreateCli(argv, {
    env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: 'private-test-token' },
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    readStdin: async () => '',
  });
  expect(stdout).toHaveLength(1);
  expect(stdout.join('') + stderr.join('')).not.toContain('private-test-token');
  return { code, json: JSON.parse(stdout.join('')) };
}

const ok = (value: unknown) => ({ ok: true, value });

describe('Bot Marketplace commands', () => {
  it('browses, filters and reads listings through the Host', async () => {
    const live = await host((method) =>
      ok(
        method === 'marketplaceTopics'
          ? [{ topic: 'writing', count: 2 }]
          : { method, bots: [], nextCursor: null },
      ),
    );
    expect((await invoke(['marketplace-list'], live.url)).json.method).toBe('marketplaceList');
    await invoke(
      [
        'marketplace-list',
        '--query',
        '翻译',
        '--topic',
        'writing',
        '--sort',
        'stars',
        '--cursor',
        'c2',
      ],
      live.url,
    );
    expect((await invoke(['marketplace-topics'], live.url)).json).toEqual({
      topics: [{ topic: 'writing', count: 2 }],
    });
    await invoke(['marketplace-detail', 'owner/repo'], live.url);
    expect(live.calls).toEqual([
      { method: 'marketplaceList', args: { query: {} } },
      {
        method: 'marketplaceList',
        args: { query: { q: '翻译', topic: 'writing', sort: 'stars', cursor: 'c2' } },
      },
      { method: 'marketplaceTopics', args: {} },
      { method: 'marketplaceDetail', args: { id: 'owner/repo' } },
    ]);
  });

  it('refuses bad arguments before reaching the Host', async () => {
    const live = await host(() => ok({}));
    for (const argv of [
      ['marketplace-list', '--sort', 'newest'],
      ['marketplace-list', 'extra'],
      ['marketplace-detail'],
      ['marketplace-topics', '--sort', 'stars'],
      ['marketplace-report', 'owner/repo', '--reason', 'x'.repeat(501)],
    ])
      expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
    expect(live.calls).toEqual([]);
  });

  it('solves the Host challenge before submitting or reporting, like the Web UI', async () => {
    const key = 'challenge-key';
    const live = await host(async (method, args) => {
      if (method === 'marketplaceChallenge')
        return ok(await createChallenge({ key, tier: 'default', now: new Date(), number: 42 }));
      const check = await verifySolution({ key, payload: String(args['altcha']), now: new Date() });
      if (!check.ok) return { ok: false, error: { code: 'challenge-invalid', message: 'bad' } };
      if (method === 'marketplaceSubmit') return ok({ bot: { id: 'owner/repo' } });
      return ok({ received: true });
    });
    const submitted = await invoke(
      ['marketplace-submit', 'https://github.com/owner/repo'],
      live.url,
    );
    expect(submitted.code).toBe(0);
    expect(submitted.json).toEqual({ bot: { id: 'owner/repo' } });
    expect(
      (await invoke(['marketplace-report', 'owner/repo', '--reason', '  spam  '], live.url)).json,
    ).toEqual({ received: true });
    await invoke(['marketplace-report', 'owner/repo'], live.url);
    expect(live.calls.map((call) => call.method)).toEqual([
      'marketplaceChallenge',
      'marketplaceSubmit',
      'marketplaceChallenge',
      'marketplaceReport',
      'marketplaceChallenge',
      'marketplaceReport',
    ]);
    expect(live.calls[1]!.args['url']).toBe('https://github.com/owner/repo');
    expect(live.calls[3]!.args).toMatchObject({ id: 'owner/repo', reason: 'spam' });
    expect(live.calls[5]!.args).not.toHaveProperty('reason');
  });

  it('passes Host refusals through with their code', async () => {
    const live = await host((method) =>
      method === 'marketplaceChallenge'
        ? { ok: false, error: { code: 'marketplace-unavailable', message: 'unavailable' } }
        : ok({}),
    );
    const refused = await invoke(['marketplace-submit', 'https://github.com/o/r'], live.url);
    expect(refused.code).not.toBe(0);
    expect(refused.json.error.code).toBe('marketplace-unavailable');
    expect(live.calls.map((call) => call.method)).toEqual(['marketplaceChallenge']);
  });
});

describe('release commands', () => {
  it.each(['busy', 'unknown'] as const)(
    'preserves %s release refusals over authenticated HTTP without manual restart advice',
    async (activity) => {
      const installBundle = vi.fn();
      const restart = vi.fn();
      const release = createReleaseService({
        version: () => '1.0.1',
        ledgers: () => undefined,
        activity: () => activity,
        installer: () => ({
          listBundles: async () => [{ name: 'deepseekbot', installed: true, version: '1.1.0' }],
          installBundle,
        }),
        restarter: () => ({ restart }),
      });
      const live = await host(async (method, args) =>
        ok(
          method === 'releaseInstall'
            ? await release.install(String(args['version']))
            : await release.restart(),
        ),
      );
      for (const argv of [
        ['release-install', '1.2.0', '--confirm'],
        ['release-restart', '--confirm'],
      ]) {
        const refused = await invoke(argv, live.url);
        expect(refused.code).not.toBe(0);
        expect(refused.json.error.code).toBe(
          activity === 'busy' ? 'release-busy' : 'release-activity-unavailable',
        );
        expect(refused.json.error.message).toContain('retry');
        expect(refused.json.error.message).not.toContain('launcher');
      }
      expect(installBundle).not.toHaveBeenCalled();
      expect(restart).not.toHaveBeenCalled();
    },
  );

  it('checks, installs and restarts only with --confirm', async () => {
    const live = await host((method, args) =>
      ok(
        method === 'releaseUpdate'
          ? { status: 'available', current: '1.1.0', latest: '1.2.0', installable: true }
          : method === 'releaseInstall'
            ? {
                status: 'installed',
                current: '1.1.0',
                installed: args['version'],
                restartable: true,
              }
            : { status: 'restarting' },
      ),
    );
    expect((await invoke(['release-check'], live.url)).json.latest).toBe('1.2.0');
    for (const argv of [['release-install', '1.2.0'], ['release-restart'], ['release-install']]) {
      const refused = await invoke(argv, live.url);
      expect(refused.code).not.toBe(0);
      expect(refused.json.error.code).toBe('usage');
    }
    expect((await invoke(['release-install', '1.2.0', '--confirm'], live.url)).json.status).toBe(
      'installed',
    );
    expect((await invoke(['release-restart', '--confirm'], live.url)).json).toEqual({
      status: 'restarting',
    });
    expect(live.calls).toEqual([
      { method: 'releaseUpdate', args: {} },
      { method: 'releaseInstall', args: { version: '1.2.0' } },
      { method: 'releaseRestart', args: {} },
    ]);
  });

  it('turns a failed install or restart into a coded failure', async () => {
    const live = await host((method) =>
      ok(
        method === 'releaseInstall'
          ? { status: 'failed', reason: 'network', diagnostic: 'registry timed out' }
          : { status: 'failed', reason: 'not-pending' },
      ),
    );
    const install = await invoke(['release-install', '9.9.9', '--confirm'], live.url);
    expect(install.code).not.toBe(0);
    expect(install.json.error.code).toBe('release-network');
    expect(install.json.error.message).toContain('registry timed out');
    const restart = await invoke(['release-restart', '--confirm'], live.url);
    expect(restart.json.error.code).toBe('release-not-pending');
  });
});

describe('telemetry and Git commands', () => {
  it('reads and sets usage statistics and Git through the Host', async () => {
    const live = await host((method, args) =>
      ok(
        method.startsWith('telemetry')
          ? { enabled: args['enabled'] ?? true, preference: args['enabled'] ?? true }
          : { state: method === 'gitInstall' ? 'installing' : 'missing' },
      ),
    );
    expect((await invoke(['telemetry-status'], live.url)).json.enabled).toBe(true);
    expect((await invoke(['telemetry-set', '--disabled'], live.url)).json.enabled).toBe(false);
    await invoke(['telemetry-set', '--enabled'], live.url);
    expect((await invoke(['telemetry-set'], live.url)).json.error.code).toBe('usage');
    expect((await invoke(['git-status'], live.url)).json.state).toBe('missing');
    expect((await invoke(['git-install'], live.url)).json.state).toBe('installing');
    expect(live.calls).toEqual([
      { method: 'telemetryStatus', args: {} },
      { method: 'telemetrySet', args: { enabled: false } },
      { method: 'telemetrySet', args: { enabled: true } },
      { method: 'gitStatus', args: {} },
      { method: 'gitInstall', args: {} },
    ]);
  });
});

describe('pairing commands', () => {
  const pairing = {
    id: '6d1f3c51-2a5e-4f4c-9a39-111111111111',
    reference: 'K7Q2',
    status: 'pending',
    purpose: 'conversation',
    accountName: 'Lark QA',
    actorId: 'ou_1',
    conversationId: 'oc_1',
    capabilities: [],
    revision: 3,
    expiresAt: '2026-10-14T13:20:00.000Z',
    createdAt: '2026-10-14T13:10:00.000Z',
    privateReply: { token: 'internal' },
  };
  const role = {
    id: '0b6f8a52-3f0d-4c1e-8f7e-222222222222',
    name: 'Reviewer',
    capabilities: ['approve'],
    revision: 5,
    behavior: 'b',
  };
  const snapshot = () => ok({ pairings: [pairing], roles: [role], accounts: [] });

  it('lists pairings without internal reply handles', async () => {
    const live = await host(snapshot);
    const listed = (await invoke(['pairing-list', 'ada'], live.url)).json;
    expect(listed.pairings).toEqual([
      expect.objectContaining({ id: pairing.id, reference: 'K7Q2', revision: 3 }),
    ]);
    expect(listed.pairings[0]).not.toHaveProperty('privateReply');
    expect(listed.roles).toEqual([
      { id: role.id, name: 'Reviewer', capabilities: ['approve'], revision: 5 },
    ]);
    expect(live.calls).toEqual([{ method: 'messagingSnapshot', args: { slug: 'ada' } }]);
  });

  it('reviews against the current revisions the Host reports', async () => {
    const live = await host((method, args) =>
      method === 'messagingSnapshot'
        ? snapshot()
        : ok({
            pairing: {
              ...pairing,
              status: (args['input'] as { kind: string }).kind === 'approve' ? 'approved' : 'x',
            },
          }),
    );
    expect(
      (
        await invoke(
          ['pairing-review', 'ada', pairing.id, '--decision', 'approve', '--role', role.id],
          live.url,
        )
      ).json.pairing.status,
    ).toBe('approved');
    await invoke(
      [
        'pairing-review',
        'ada',
        pairing.id,
        '--decision',
        'approve',
        '--capability',
        'approve',
        '--capability',
        'answer',
      ],
      live.url,
    );
    await invoke(['pairing-review', 'ada', pairing.id, '--decision', 'reject'], live.url);
    await invoke(
      ['pairing-review', 'ada', pairing.id, '--decision', 'revoke', '--confirm'],
      live.url,
    );
    expect(live.calls.filter((call) => call.method === 'pairingReview')).toEqual([
      {
        method: 'pairingReview',
        args: {
          slug: 'ada',
          input: {
            kind: 'approve',
            id: pairing.id,
            expectedRevision: 3,
            roleId: role.id,
            expectedRoleRevision: 5,
          },
        },
      },
      {
        method: 'pairingReview',
        args: {
          slug: 'ada',
          input: {
            kind: 'approve',
            id: pairing.id,
            expectedRevision: 3,
            capabilities: ['approve', 'answer'],
          },
        },
      },
      {
        method: 'pairingReview',
        args: { slug: 'ada', input: { kind: 'reject', id: pairing.id, expectedRevision: 3 } },
      },
      {
        method: 'pairingReview',
        args: { slug: 'ada', input: { kind: 'revoke', id: pairing.id, expectedRevision: 3 } },
      },
    ]);
  });

  it('refuses unclear decisions, revoke without --confirm and unknown ids', async () => {
    const live = await host(snapshot);
    for (const argv of [
      ['pairing-review', 'ada', pairing.id],
      ['pairing-review', 'ada', pairing.id, '--decision', 'approve'],
      [
        'pairing-review',
        'ada',
        pairing.id,
        '--decision',
        'approve',
        '--role',
        role.id,
        '--capability',
        'approve',
      ],
      ['pairing-review', 'ada', pairing.id, '--decision', 'approve', '--capability', 'admin'],
      ['pairing-review', 'ada', pairing.id, '--decision', 'reject', '--capability', 'approve'],
      ['pairing-review', 'ada', pairing.id, '--decision', 'revoke'],
      ['pairing-review', 'ada'],
    ])
      expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
    expect(live.calls).toEqual([]);
    expect(
      (await invoke(['pairing-review', 'ada', 'missing', '--decision', 'reject'], live.url)).json
        .error.code,
    ).toBe('unknown-pairing');
    expect(
      (
        await invoke(
          ['pairing-review', 'ada', pairing.id, '--decision', 'approve', '--role', 'nope'],
          live.url,
        )
      ).json.error.code,
    ).toBe('unknown-role');
    expect(live.calls.map((call) => call.method)).toEqual([
      'messagingSnapshot',
      'messagingSnapshot',
    ]);
  });
});
