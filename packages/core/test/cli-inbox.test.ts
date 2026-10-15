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
    calls.push({ method, args: body.payload.args });
    res.setHeader('content-type', 'application/json');
    if (stallBody) {
      res.write('{');
      return;
    }
    res.end(
      JSON.stringify({
        type: 'server-response',
        rpcId: body.rpcId,
        result: handler(method, body.payload.args),
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

const echo = (method: string, args: Record<string, unknown>) => ({
  ok: true,
  value:
    method === 'privateMcpServerEnable'
      ? { accepted: true }
      : method === 'privateMcpServerRemove'
        ? { removed: true }
        : method === 'channelAssign'
          ? {}
          : { method, args },
});

describe('Human Inbox, assignment, Session and approval-rule commands', () => {
  it('lists, counts, dismisses and ignores Human Inbox items through the live Host', async () => {
    const live = await host(echo);
    const listed = await invoke(
      [
        'inbox',
        '--category',
        'action',
        '--bot',
        'ada',
        '--channel',
        'dm-ada',
        '--limit',
        '20',
        '--cursor',
        'c1',
        '--sort',
        'oldest',
      ],
      live.url,
    );
    expect(listed.code).toBe(0);
    await invoke(['inbox'], live.url);
    await invoke(['inbox-status'], live.url);
    await invoke(['inbox-dismiss', 'item-1', '--source-key', 'src-1'], live.url);
    await invoke(['inbox-dismiss', 'item-2'], live.url);
    await invoke(['inbox-ignore', 'src-9'], live.url);
    expect(live.calls).toEqual([
      {
        method: 'humanAttention',
        args: {
          category: 'action',
          botSlug: 'ada',
          channelId: 'dm-ada',
          limit: 20,
          cursor: 'c1',
          sort: 'oldest',
        },
      },
      { method: 'humanAttention', args: {} },
      { method: 'humanAttentionStatus', args: {} },
      { method: 'humanAttentionDismiss', args: { itemId: 'item-1', sourceKey: 'src-1' } },
      { method: 'humanAttentionDismiss', args: { itemId: 'item-2', sourceKey: '' } },
      { method: 'humanAttentionIgnore', args: { sourceEventId: 'src-9' } },
    ]);
  });

  it('snoozes a Human Inbox item, lists snoozed items and brings one back', async () => {
    const live = await host(echo);
    await invoke(
      [
        'inbox-snooze',
        'approval:src-1',
        '--source-key',
        'src-1',
        '--until',
        '2026-10-15T09:00:00+08:00',
      ],
      live.url,
    );
    await invoke(['inbox', '--category', 'action', '--snoozed'], live.url);
    await invoke(['inbox-snooze', 'approval:src-1', '--source-key', 'src-1', '--clear'], live.url);
    for (const argv of [
      ['inbox-snooze', 'approval:src-1'],
      ['inbox-snooze', 'approval:src-1', '--until', 'tomorrow'],
      ['inbox-snooze', 'approval:src-1', '--until', '2026-10-15T09:00:00Z', '--clear'],
    ])
      expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
    expect(live.calls).toEqual([
      {
        method: 'humanAttentionSnooze',
        args: { itemId: 'approval:src-1', sourceKey: 'src-1', until: '2026-10-15T01:00:00.000Z' },
      },
      { method: 'humanAttention', args: { category: 'action', snoozed: true } },
      {
        method: 'humanAttentionSnooze',
        args: { itemId: 'approval:src-1', sourceKey: 'src-1', until: null },
      },
    ]);
  });

  it('lists auto-rejected calls and allows one once anyway', async () => {
    const live = await host(echo);
    await invoke(['inbox', '--category', 'action', '--kind', 'auto-rejection'], live.url);
    await invoke(['inbox-allow-once', 'autoreject:src-1'], live.url);
    for (const argv of [
      ['inbox', '--kind', 'tool-approval'],
      ['inbox-allow-once'],
      ['inbox-allow-once', 'approval:src-1'],
    ])
      expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
    expect(live.calls).toEqual([
      { method: 'humanAttention', args: { category: 'action', kind: 'auto-rejection' } },
      { method: 'toolAutoRejectionOverride', args: { itemId: 'autoreject:src-1' } },
    ]);
  });

  it('refuses malformed Inbox queries before reaching the Host', async () => {
    const live = await host(echo);
    for (const argv of [
      ['inbox', '--category', 'everything'],
      ['inbox', '--sort', 'random'],
      ['inbox', '--limit', '0'],
      ['inbox', 'extra'],
      ['inbox-status', 'extra'],
      ['inbox-dismiss'],
      ['inbox-ignore', ' '],
      ['assignment-context', 'ada', '--session', 's1'],
      ['assignment-context', 'ada', '--source', 'e1'],
    ]) {
      const result = await invoke(argv, live.url);
      expect(result.code).not.toBe(0);
      expect(result.json.error.code).toBe('usage');
    }
    expect(live.calls).toHaveLength(0);
  });

  it('reads assignment context and lists and assigns Channel work', async () => {
    const live = await host(echo);
    await invoke(
      ['assignment-context', 'ada', '--session', 'sess-1', '--source', 'src-1'],
      live.url,
    );
    await invoke(['channel-assignments', 'group-1'], live.url);
    expect(
      (await invoke(['channel-assign', 'group-1', '--section', 'sec-1', '--index', '2'], live.url))
        .json,
    ).toEqual({ channelId: 'group-1', sectionId: 'sec-1' });
    expect((await invoke(['channel-assign', 'group-1', '--unsectioned'], live.url)).json).toEqual({
      channelId: 'group-1',
      sectionId: null,
    });
    for (const argv of [
      ['channel-assign', 'group-1'],
      ['channel-assign', 'group-1', '--section', 'sec-1', '--unsectioned'],
      ['channel-assign', 'group-1', '--section', 'sec-1', '--index', '-1'],
    ])
      expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
    expect(live.calls).toEqual([
      {
        method: 'humanAssignmentContext',
        args: { slug: 'ada', sessionId: 'sess-1', sourceEventId: 'src-1' },
      },
      { method: 'channelAssignments', args: { channelId: 'group-1' } },
      { method: 'channelAssign', args: { channelId: 'group-1', sectionId: 'sec-1', index: 2 } },
      { method: 'channelAssign', args: { channelId: 'group-1', sectionId: null } },
    ]);
  });

  it('lists Bot Sessions, reads their owner and archives assignment Sessions', async () => {
    const live = await host(echo);
    await invoke(['session-ids'], live.url);
    await invoke(['session-owner', 'sess-1'], live.url);
    await invoke(['session-archive-set', 'ada', '--session', 'sess-1', '--archived'], live.url);
    await invoke(['session-archive-set', 'ada', '--session', 'sess-1', '--unarchived'], live.url);
    for (const argv of [
      ['session-archive-set', 'ada', '--session', 'sess-1'],
      ['session-archive-set', 'ada', '--archived'],
      ['session-owner'],
    ])
      expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
    expect(live.calls).toEqual([
      { method: 'botSessionIds', args: {} },
      { method: 'sessionOwner', args: { sessionId: 'sess-1' } },
      { method: 'sessionArchiveSet', args: { slug: 'ada', sessionId: 'sess-1', archived: true } },
      { method: 'sessionArchiveSet', args: { slug: 'ada', sessionId: 'sess-1', archived: false } },
    ]);
  });

  it('lists and revokes always-allow rules, and revokes grants online, only with --confirm', async () => {
    const live = await host(echo);
    await invoke(['tool-approval-rules', 'ada'], live.url);
    for (const argv of [
      ['tool-approval-rule-revoke', 'ada', '--rule', 'r1'],
      ['grant-revoke', 'ada', '--grant', 'g1'],
      ['private-mcp-remove', 'ada', '--server', 'notes'],
    ]) {
      const refused = await invoke(argv, live.url);
      expect(refused.json.error.code).toBe('usage');
      expect(refused.json.error.message).toContain('--confirm');
    }
    await invoke(['tool-approval-rule-revoke', 'ada', '--rule', 'r1', '--confirm'], live.url);
    await invoke(['grant-revoke', 'ada', '--grant', 'g1', '--confirm'], live.url);
    await invoke(['grant-write-set', 'ada', '--grant', 'g1', '--disabled'], live.url);
    expect(
      (await invoke(['grant-write-set', 'ada', '--grant', 'g1'], live.url)).json.error.code,
    ).toBe('usage');
    expect(live.calls).toEqual([
      { method: 'toolApprovalRules', args: { slug: 'ada' } },
      { method: 'toolApprovalRuleRevoke', args: { slug: 'ada', id: 'r1' } },
      { method: 'grantRevoke', args: { slug: 'ada', grantId: 'g1' } },
      { method: 'grantWriteSet', args: { slug: 'ada', grantId: 'g1', enabled: false } },
    ]);
  });

  it('turns a private MCP server on or off and removes it, with coded refusals', async () => {
    const live = await host(echo);
    expect(
      (await invoke(['private-mcp-set', 'ada', '--server', 'notes', '--enabled'], live.url)).json,
    ).toEqual({ accepted: true });
    expect(
      (await invoke(['private-mcp-remove', 'ada', '--server', 'notes', '--confirm'], live.url))
        .json,
    ).toEqual({ removed: true });
    expect(live.calls).toEqual([
      {
        method: 'privateMcpServerEnable',
        args: { slug: 'ada', serverName: 'notes', enabled: true },
      },
      { method: 'privateMcpServerRemove', args: { slug: 'ada', serverName: 'notes' } },
    ]);
    const refusing = await host((method) => ({
      ok: true,
      value: method === 'privateMcpServerEnable' ? { accepted: false } : { removed: false },
    }));
    for (const argv of [
      ['private-mcp-set', 'ada', '--server', 'gone', '--disabled'],
      ['private-mcp-remove', 'ada', '--server', 'gone', '--confirm'],
    ]) {
      const refused = await invoke(argv, refusing.url);
      expect(refused.code).not.toBe(0);
      expect(refused.json.error.code).toBe('private-mcp-server-unavailable');
    }
  });

  it("passes the Host's refusal code through", async () => {
    const live = await host(() => ({
      ok: false,
      error: { code: 'invalid_input', message: 'Inbox item is no longer available' },
    }));
    const refused = await invoke(['inbox-dismiss', 'item-1'], live.url);
    expect(refused.code).not.toBe(0);
    expect(refused.json.error).toEqual({
      code: 'invalid_input',
      message: 'Inbox item is no longer available',
    });
  });

  it('does not combine --home with a live grant command', async () => {
    const live = await host(echo);
    const result = await invoke(
      ['grant-revoke', 'ada', '--grant', 'g1', '--confirm', '--home', '/tmp/x'],
      live.url,
    );
    expect(result.json.error.code).toBe('usage');
    expect(live.calls).toHaveLength(0);
  });
});
