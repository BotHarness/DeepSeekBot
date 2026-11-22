import { fakeTeamMode } from '../../host-client/test/reader-fixtures.js';
import { describe, expect, it } from 'vitest';
import { host, run } from './cli-team-fixtures.js';

describe('M9 lifecycle CLI', () => {
  it.each([
    {
      args: ['members', 'deactivate', 'bob'],
      method: 'memberDeactivate',
      payload: { humanId: 'bob-id' },
    },
    {
      args: ['members', 'reactivate', 'bob'],
      method: 'memberReactivate',
      payload: { humanId: 'bob-id' },
    },
    {
      args: ['members', 'transfer', 'bob', '--preview'],
      method: 'memberTransferPreview',
      payload: { humanId: 'bob-id' },
    },
    {
      args: ['members', 'transfer', 'bob', '--to', 'owner'],
      method: 'memberTransfer',
      payload: { humanId: 'bob-id', toHumanId: 'local-human' },
    },
    {
      args: ['members', 'purge', 'bob', '--preview'],
      method: 'memberPurgePreview',
      payload: { humanId: 'bob-id' },
    },
    {
      args: ['members', 'purge', 'bob', '--token-stdin', '--confirm'],
      method: 'memberPurgeConfirm',
      payload: { humanId: 'bob-id', token: 'private-token', username: 'bob' },
    },
    {
      args: ['members', 'change-password', '--password-stdin', '--sign-out-others=false'],
      method: 'memberPasswordChange',
      payload: { current: 'old-password', next: 'new-password', signOutOthers: false },
    },
    {
      args: ['members', 'change-password', '--password-stdin'],
      method: 'memberPasswordChange',
      payload: { current: 'old-password', next: 'new-password', signOutOthers: true },
    },
  ])('dispatches $method using the agreed payload', async ({ args, method, payload }) => {
    const f = await host();
    const result = await run(
      f.url,
      args,
      method === 'memberPasswordChange'
        ? JSON.stringify({ current: 'old-password', next: 'new-password' })
        : 'private-token',
    );
    expect(result.status).toBe(0);
    expect(f.calls.at(-1)?.input).toMatchObject({
      method: `botharness/${method}`,
      payload: { args: payload },
    });
    expect(result.text + result.errorText).not.toContain('private-token');
  });
  it.each([
    ['members', 'purge', 'bob', '--token-stdin'],
    ['members', 'purge', 'bob', '--confirm'],
    ['members', 'transfer', 'bob'],
    ['members', 'change-password', '--password-stdin', '--sign-out-others=maybe'],
  ])('refuses incomplete or invalid lifecycle commands: %s', async (...args) => {
    const f = await host();
    expect((await run(f.url, args, 'private-token')).status).not.toBe(0);
    expect(
      f.calls.some((call) =>
        [
          'botharness/memberPurgeConfirm',
          'botharness/memberTransfer',
          'botharness/memberPasswordChange',
        ].includes(String(call.input.method)),
      ),
    ).toBe(false);
  });
});

describe('M2 CLI member Bot and Activity dispatch', () => {
  it('reports no Tob as an available:false success under --as without Owner fallback', async () => {
    const f = await host(undefined, undefined, undefined, { available: false });
    const result = await run(f.url, ['--as', 'bob', 'tob-home']);
    expect(result.status).toBe(0);
    expect(result.output).toEqual({ available: false });
    expect(f.calls.filter((call) => call.path === '/api/botharness/team-as')).toHaveLength(1);
    expect(f.calls.at(-1)?.input).toMatchObject({ method: 'tobHome', args: {} });
  });
  it.each([
    {
      code: 'permission-required',
      message: 'permission-required',
      details: { permission: 'bots.createPrivate' },
    },
    { code: 'member-suspended', message: 'member-suspended' },
  ])('preserves $code from bots create --as without Owner fallback', async (failure) => {
    const f = await host(failure);
    const result = await run(f.url, [
      'bots',
      'create',
      '--as',
      'bob',
      '--name',
      'Denied Bot',
      '--operation-key',
      'denied-bot-create-0001',
    ]);
    expect(result.status).toBe(1);
    expect(result.output).toMatchObject({ error: failure });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toMatchObject({
      path: '/api/botharness/team-as',
      input: { username: 'bob', method: 'create' },
    });
  });

  it.each([
    {
      argv: ['team-mode', 'status'],
      value: fakeTeamMode({ humanId: 'bob', kind: 'member', displayName: 'Bob' }),
    },
    {
      argv: [
        'tool-approval-decide',
        'channel',
        '--message-id',
        'request',
        '--outcome',
        'allowed-once',
      ],
      value: { accepted: true },
    },
  ])('keeps the successful member $argv response intact', async ({ argv, value }) => {
    const f = await host(undefined, undefined, undefined, value);
    const result = await run(f.url, ['--as', 'bob', ...argv]);
    expect(result.status).toBe(0);
    expect(result.output).toEqual(value);
  });

  it.each([
    { code: 'approval-not-allowed', message: 'approval-not-allowed' },
    {
      code: 'permission-required',
      message: 'permission-required',
      details: { permission: 'approvals.opaqueTools' },
    },
  ])('preserves approval refusal $code through --as', async (failure) => {
    const f = await host(failure);
    const result = await run(f.url, [
      '--as',
      'bob',
      'tool-approval-decide',
      'channel',
      '--message-id',
      'request',
      '--outcome',
      'allowed-once',
    ]);
    expect(result.status).toBe(1);
    expect(result.output).toMatchObject({ error: failure });
  });

  it.each([
    { argv: ['bots', 'list'], method: 'list', stdin: '' },
    { argv: ['bots', 'list', '--administration'], method: 'list', stdin: '' },
    { argv: ['bots', 'show', 'alice-bot'], method: 'get', stdin: '' },
    {
      argv: ['bots', 'create', '--name', 'Member Bot', '--operation-key', 'member-cli-0001'],
      method: 'create',
      stdin: '',
    },
    {
      argv: ['bots', 'delete', 'alice-bot', '--confirm', '--confirmation-stdin'],
      method: 'deletionConfirm',
      stdin: '{"token":"reviewed-deletion-token"}',
    },
    { argv: ['activity', 'list'], method: 'humanAttention', stdin: '' },
    { argv: ['team-mode', 'status'], method: 'teamMode', stdin: '' },
    {
      argv: ['tool-approval-status', 'channel', '--message-id', 'request'],
      method: 'toolApprovalStatus',
      stdin: '',
    },
    {
      argv: [
        'tool-approval-decide',
        'channel',
        '--message-id',
        'request',
        '--outcome',
        'allowed-once',
      ],
      method: 'toolApprovalDecide',
      stdin: '',
    },
  ])('keeps $method on the member Peer without Owner fallback', async ({ argv, method, stdin }) => {
    const f = await host();
    const result = await run(f.url, ['--as', 'bob', ...argv], stdin);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatchObject({ error: { code: 'remote-access/denied' } });
    expect(f.calls).toEqual([
      expect.objectContaining({
        path: '/api/botharness/team-as',
        input: expect.objectContaining({ username: 'bob', namespace: 'botharness', method }),
      }),
    ]);
  });
});
