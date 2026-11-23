import { fakeTeamMode } from '../../host-client/test/reader-fixtures.js';
import { join } from 'node:path';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createTempRoot } from './helpers.js';
import { host, run } from './cli-team-fixtures.js';

describe('Team CLI', () => {
  it.each([
    { command: 'bot-zip-upload', method: 'zipUploadBegin' },
    { command: 'bot-zip-preview', method: 'zipUploadPreview' },
    { command: 'bot-zip-import', method: 'zipImport' },
    { command: 'bot-zip-import-status', method: 'zipImportLookup' },
  ])(
    'routes --as $command through member authority and preserves import permission refusals',
    async ({ command, method }) => {
      const error = {
        code: 'permission-required',
        message: 'permission-required',
        details: { permission: 'bots.createPrivate' },
      };
      const f = await host(error);
      const file = join(createTempRoot('member-zip-cli-'), 'fixture.zip');
      writeFileSync(file, Buffer.alloc(22));
      const result = await run(f.url, [
        '--as',
        'bob',
        command,
        '--upload-key',
        'member-zip-upload',
        '--operation-key',
        'member-zip-import',
        '--name',
        'Private',
        ...(command === 'bot-zip-upload'
          ? ['--from-zip', file]
          : ['--archive-sha256', 'a'.repeat(64), '--archive-size', '22']),
      ]);
      expect(result.status).not.toBe(0);
      expect(result.output).toEqual({ error });
      expect(f.calls).toEqual([
        {
          path: '/api/botharness/team-as',
          input: expect.objectContaining({ username: 'bob', namespace: 'botharness', method }),
        },
      ]);
    },
  );

  it('preserves coded path details for member CLI refusals without an Owner fallback', async () => {
    const error = {
      code: 'grant-foreign-space',
      message: 'grant-foreign-space',
      details: { path: '/spaces/bob/files', spaceId: 'spaces/bob' },
    };
    const f = await host(error);
    expect((await run(f.url, ['--as', 'bob', 'spaces', 'list'])).output).toMatchObject({ error });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]?.path).toBe('/api/botharness/team-as');
  });
  it.each([
    { args: ['spaces', 'list'], method: 'spaces', payload: {} },
    { args: ['spaces', 'audience-directory'], method: 'spaceAudienceDirectory', payload: {} },
    {
      args: ['spaces', 'create', '--name', 'Finance', '--audience', 'roles:admin,finance'],
      method: 'spaceCreate',
      payload: { name: 'Finance', audience: { kind: 'roles', roleIds: ['admin', 'finance'] } },
    },
    {
      args: ['spaces', 'create', '--name', 'People', '--audience', 'members:alice,bob'],
      method: 'spaceCreate',
      payload: { name: 'People', audience: { kind: 'members', humanIds: ['alice', 'bob'] } },
    },
    {
      args: ['spaces', 'update', 'shared/team', '--name', 'Team', '--audience', 'everyone'],
      method: 'spaceUpdate',
      payload: { spaceId: 'shared/team', name: 'Team', audience: { kind: 'everyone' } },
    },
    {
      args: ['spaces', 'delete', 'shared/team', '--confirm'],
      method: 'spaceDelete',
      payload: { spaceId: 'shared/team', confirm: true },
    },
  ])(
    'keeps spaces CLI payload and --as authority for $method',
    async ({ args, method, payload }) => {
      const f = await host({
        code: 'permission-required',
        message: 'permission-required',
        details: { permission: 'workspaces.manageShared' },
      });
      const own = await run(f.url, args);
      expect(own.status).toBe(0);
      expect(f.calls.at(-1)).toMatchObject({
        path: '/api/botharness/' + method,
        input: { method: 'botharness/' + method, payload: { args: payload } },
      });
      const before = f.calls.length;
      const as = await run(f.url, ['--as', 'bob', ...args]);
      expect(as.output).toMatchObject({
        error: { code: 'permission-required', details: { permission: 'workspaces.manageShared' } },
      });
      expect(f.calls.slice(before)).toEqual([
        {
          path: '/api/botharness/team-as',
          input: { username: 'bob', namespace: 'botharness', method, args: payload },
        },
      ]);
    },
  );
  it.each([
    ['spaces', 'delete', 'shared/team'],
    ['spaces', 'create', '--name', 'Bad', '--audience', 'roles:'],
    ['spaces', 'create', '--name', 'Bad', '--audience', 'unknown:alice'],
    ['spaces', 'update', 'shared/team'],
  ])('refuses invalid or unconfirmed spaces command %j before mutation', async (...args) => {
    const f = await host();
    expect((await run(f.url, args)).status).not.toBe(0);
    expect(f.calls).toHaveLength(0);
  });
  it.each([
    { code: 'permission-required', details: { permission: 'usage.view' } },
    { code: 'model-not-allowed', details: { route: 'provider/model' } },
  ])('preserves safe $code details through normal and --as refusals', async ({ code, details }) => {
    const f = await host(undefined, undefined, {
      code,
      details: { ...details, internalSecret: 'must-not-print' },
    });
    for (const args of [[], ['--as', 'bob']]) {
      const result = await run(f.url, ['usage', 'members', '--period', 'week', ...args]);
      expect(result.output).toEqual({ error: { code, message: code, details } });
      expect(result.text + result.errorText).not.toContain('must-not-print');
    }
  });

  it.each([
    {
      args: ['usage', 'members', '--period', 'week'],
      method: 'usageByMember',
      payload: { period: 'week' },
    },
    { args: ['models', 'allowed'], method: 'modelsAllowed', payload: {} },
    {
      args: [
        'roles',
        'create',
        '--name',
        'Restricted',
        '--permissions',
        '',
        '--models',
        'provider/one,provider/two',
      ],
      method: 'roleCreate',
      payload: {
        name: 'Restricted',
        permissions: [],
        models: { kind: 'only', routes: ['provider/one', 'provider/two'] },
      },
    },
    {
      args: ['roles', 'create', '--name', 'Unrestricted', '--permissions', '', '--models', 'all'],
      method: 'roleCreate',
      payload: { name: 'Unrestricted', permissions: [], models: { kind: 'all' } },
    },
    {
      args: ['roles', 'update', 'member', '--models', 'provider/one,provider/two'],
      method: 'roleUpdate',
      payload: {
        roleId: 'member',
        models: { kind: 'only', routes: ['provider/one', 'provider/two'] },
      },
    },
    {
      args: ['roles', 'update', 'member', '--models', 'all'],
      method: 'roleUpdate',
      payload: { roleId: 'member', models: { kind: 'all' } },
    },
    {
      args: [
        'roles',
        'create',
        '--name',
        'Workers',
        '--permissions',
        'models.use',
        '--models',
        'all',
        '--engine-accounts',
        'codex-work,claude-work',
      ],
      method: 'roleCreate',
      payload: {
        name: 'Workers',
        permissions: ['models.use'],
        models: { kind: 'all', engineAccounts: ['codex-work', 'claude-work'] },
      },
    },
    {
      args: ['roles', 'update', 'member', '--engine-accounts', ''],
      method: 'roleUpdate',
      payload: { roleId: 'member', models: { kind: 'only', routes: [], engineAccounts: [] } },
    },
    {
      args: ['roles', 'update', 'member', '--model-providers', 'go', '--models', 'exact/model'],
      method: 'roleUpdate',
      payload: {
        roleId: 'member',
        models: { kind: 'only', providers: ['go'], routes: ['exact/model'] },
      },
    },
  ])('dispatches M10 $method normally and through --as', async ({ args, method, payload }) => {
    const f = await host();
    expect((await run(f.url, args)).status).toBe(0);
    expect(f.calls.at(-1)?.input).toMatchObject({
      method: `botharness/${method}`,
      payload: { args: payload },
    });
    expect((await run(f.url, [...args, '--as', 'bob'])).output).toMatchObject({
      error: { code: 'remote-access/denied' },
    });
    expect(f.calls.at(-1)).toMatchObject({
      path: '/api/botharness/team-as',
      input: { username: 'bob', method, args: payload },
    });
  });

  it.each([
    ['list'],
    ['approve', 'a'.repeat(32), 'ab'.repeat(32), '--confirm'],
    ['enroll', 'a'.repeat(32), '--out', 'private-relationship-client.json'],
    ['disconnect', 'a'.repeat(32), '--confirm'],
    ['sync', 'a'.repeat(32)],
  ])(
    'refuses member impersonation for relationship %j without an Owner HTTP fallback',
    async (...args) => {
      const f = await host();
      const result = await run(f.url, ['--as', 'bob', 'relationships', ...args]);
      expect(result.output).toMatchObject({ error: { code: 'as-command-unsupported' } });
      expect(f.calls).toHaveLength(0);
    },
  );
  it('recovers a committed username into a new private file without printing its password', async () => {
    const f = await host();
    const path = join(createTempRoot('team-cli-reset-'), 'reset-password');
    const args = ['members', 'reset-password', 'bob', '--initial-password-file', path];
    const reset = await run(f.url, args);
    expect(reset.status).toBe(0);
    expect(reset.output).toEqual({ humanId: 'bob-id', initialPasswordFile: path });
    expect(readFileSync(path, 'utf8')).toBe('private-reset-password');
    if (process.platform !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(reset.text + reset.errorText).not.toContain('private-reset-password');
    expect(f.calls).toMatchObject([
      { input: { method: 'botharness/members' } },
      {
        input: {
          method: 'botharness/memberPasswordReset',
          payload: { args: { humanId: 'bob-id' } },
        },
      },
    ]);
    const count = f.calls.length;
    expect((await run(f.url, args)).output).toMatchObject({
      error: { code: 'password-file-unavailable' },
    });
    expect(f.calls).toHaveLength(count);
    const missing = join(createTempRoot('team-cli-missing-'), 'password');
    expect(
      (
        await run(f.url, [
          'members',
          'reset-password',
          'missing',
          '--initial-password-file',
          missing,
        ])
      ).output,
    ).toMatchObject({ error: { code: 'member-not-found' } });
    expect(existsSync(missing)).toBe(false);
  });
  it.each([
    'device-activity',
    'device-notifications',
    'phone-notifications',
    'device-pair',
    'device-owner-sign-in',
    'device-probe',
  ])('refuses --as before %s device dispatch', async (command) => {
    const f = await host();
    const result = await run(f.url, ['--as', 'bob', command]);
    expect(result.output).toMatchObject({ error: { code: 'as-command-unsupported' } });
    expect(f.calls).toHaveLength(0);
  });
  it.each([{ args: ['channels'] }, { args: ['channel-messages', 'group-1', '--as', 'bob'] }])(
    'refuses --home before early hosted dispatch: %j',
    async ({ args }) => {
      const f = await host();
      const result = await run(f.url, [...args, '--home', createTempRoot('team-cli-home-')]);
      expect(result.status).not.toBe(0);
      expect(f.calls).toHaveLength(0);
    },
  );
  it.each([
    [['team-mode', 'status'], 'teamMode', {}],
    [['team-mode', 'on'], 'teamModeSet', { enabled: true }],
    [['team-mode', 'off'], 'teamModeSet', { enabled: false }],
    [['team-mode', 'owner-sign-in', 'status'], 'ownerPasswordSignIn', {}],
    [
      ['team-mode', 'owner-sign-in', 'on', '--confirm'],
      'ownerPasswordSignInSet',
      { enabled: true },
    ],
    [['team-mode', 'owner-sign-in', 'off'], 'ownerPasswordSignInSet', { enabled: false }],
    [['team-mode', 'insecure-http', 'on', '--confirm'], 'teamInsecureHttpSet', { allowed: true }],
    [['members', 'list'], 'members', {}],
    [['roles', 'list'], 'roles', {}],
    [['roles', 'catalog'], 'permissionCatalog', {}],
    [
      ['roles', 'create', '--name', 'Reviewers', '--permissions', 'audit.view,usage.view'],
      'roleCreate',
      { name: 'Reviewers', permissions: ['audit.view', 'usage.view'] },
    ],
    [
      ['roles', 'update', 'reviewers', '--permissions', ''],
      'roleUpdate',
      { roleId: 'reviewers', permissions: [] },
    ],
    [
      ['roles', 'update', 'reviewers', '--name', 'Operators'],
      'roleUpdate',
      { roleId: 'reviewers', name: 'Operators' },
    ],
    [['roles', 'delete', 'reviewers', '--confirm'], 'roleDelete', { roleId: 'reviewers' }],
    [
      ['channels', 'set-public', 'group-1', 'on'],
      'channelPublicSet',
      { channelId: 'group-1', public: true },
    ],
  ] as const)('maps %j to the matching bridge contract', async (args, method, named) => {
    const f = await host();
    const result = await run(f.url, [...args]);
    expect(result.status).toBe(0);
    expect(f.calls).toMatchObject([
      { path: `/api/botharness/${method}`, input: { payload: { args: named } } },
    ]);
  });

  it('creates standalone Owner credentials from stdin without echoing the password', async () => {
    const f = await host();
    const args = ['team-mode', 'owner-sign-in', 'on', '--username', 'alice', '--password-stdin'];
    const password = 'private-owner-sign-in-password';
    const unconfirmed = await run(f.url, args, password);
    expect(unconfirmed.status).not.toBe(0);
    expect(f.calls).toHaveLength(0);

    const result = await run(f.url, [...args, '--confirm'], password + '\n');
    expect(result.status).toBe(0);
    expect(result.text + result.errorText).not.toContain(password);
    expect(f.calls).toMatchObject([
      {
        path: '/api/botharness/ownerPasswordSignInSet',
        input: { payload: { args: { enabled: true, username: 'alice', password } } },
      },
    ]);
  });

  it('resolves an invitation username and prints only the bridge link JSON', async () => {
    const f = await host();
    const result = await run(f.url, ['members', 'invite', 'bob']);
    expect(result.status).toBe(0);
    expect(result.output).toEqual({ done: true });
    expect(f.calls.map((call) => call.path)).toEqual([
      '/api/botharness/members',
      '/api/botharness/memberInvitation',
    ]);
    expect(f.calls[1]?.input).toMatchObject({ payload: { args: { humanId: 'bob-id' } } });
    const missing = await run(f.url, ['members', 'invite', 'missing']);
    expect(missing.status).not.toBe(0);
    expect(missing.output).toMatchObject({ error: { code: 'member-not-found' } });
    expect(f.calls).toHaveLength(3);
  });

  it('dispatches self-pairing under the explicit member and retains the member refusal', async () => {
    const f = await host();
    const result = await run(f.url, ['--as', 'bob', 'members', 'pairing-offer']);
    expect(result.output).toMatchObject({ error: { code: 'remote-access/denied' } });
    expect(f.calls).toEqual([
      {
        path: '/api/botharness/team-as',
        input: { username: 'bob', namespace: 'botharness', method: 'memberPairingOffer', args: {} },
      },
    ]);
  });

  it('passes the Owner device sign-out choice only with explicit CLI confirmation', async () => {
    const f = await host();
    const args = ['team-mode', 'owner-password', '--password-stdin', '--sign-out-others=true'];
    const input = '{"current":"previous-owner-password","password":"updated-owner-password"}';
    const refused = await run(f.url, args, input);
    expect(refused.output).toMatchObject({ error: { code: 'confirm-required' } });
    expect(f.calls).toEqual([]);

    const changed = await run(f.url, [...args, '--confirm'], input);
    expect(changed.status).toBe(0);
    expect(changed.text + changed.errorText).not.toContain('updated-owner-password');
    expect(f.calls[0]?.input).toMatchObject({
      payload: {
        args: {
          current: 'previous-owner-password',
          password: 'updated-owner-password',
          signOutOthers: true,
        },
      },
    });
  });

  it('reads Owner and member passwords only from stdin and requires confirmation for insecure HTTP', async () => {
    const f = await host();
    expect(
      (
        await run(
          f.url,
          ['team-mode', 'owner-password', '--password-stdin'],
          'secret-owner-password\n',
        )
      ).status,
    ).toBe(0);
    expect(f.calls[0]?.input).toMatchObject({
      payload: { args: { password: 'secret-owner-password' } },
    });
    const changed = await run(
      f.url,
      ['members', 'password', '--password-stdin'],
      '{"current":"first-password","next":"next-password"}',
    );
    expect(changed.status).toBe(0);
    expect(changed.text).not.toContain('first-password');
    const insecure = await run(f.url, ['team-mode', 'insecure-http', 'on']);
    expect(insecure.status).not.toBe(0);
  });

  it('writes the initial password to a new 0600 file and refuses an existing path before creating a member', async () => {
    const f = await host();
    const path = join(createTempRoot('team-cli-password-'), 'password');
    const args = [
      'members',
      'create',
      '--username',
      'bob',
      '--display-name',
      'Bob',
      '--initial-password-file',
      path,
    ];
    const created = await run(f.url, args);
    expect(created.status).toBe(0);
    expect(created.output).toMatchObject({ initialPasswordFile: path });
    expect(readFileSync(path, 'utf8')).toBe('private-initial-password');
    if (process.platform !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(created.text).not.toContain('private-initial-password');
    const callCount = f.calls.length;
    writeFileSync(path, 'keep-me');
    expect((await run(f.url, args)).status).not.toBe(0);
    expect(f.calls).toHaveLength(callCount);
    expect(readFileSync(path, 'utf8')).toBe('keep-me');
    expect(existsSync(path)).toBe(true);
  });

  it.each([
    ['channels', 'browse'],
    ['channels', 'join', 'group-1'],
    ['channels', 'browse-public'],
    ['channels', 'join-public', 'group-1'],
  ])('refuses the removed %s %s form without calling the Host', async (...args) => {
    const f = await host();
    const result = await run(f.url, args);
    expect(result.status).not.toBe(0);
    expect(f.calls).toEqual([]);
  });
  it('dispatches --as through the Owner-only member endpoint and propagates the refusal without falling back', async () => {
    const f = await host();
    const result = await run(f.url, ['--as', 'bob', 'channels', 'get', 'group-1']);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatchObject({ error: { code: 'remote-access/denied' } });
    expect(f.calls).toEqual([
      {
        path: '/api/botharness/team-as',
        input: {
          username: 'bob',
          namespace: 'botharness',
          method: 'channelGet',
          args: { channelId: 'group-1' },
        },
      },
    ]);
  });
  it.each([
    {
      args: ['human-name-set', '--name', 'Bob Chen'],
      method: 'humanNameSet',
      input: { displayName: 'Bob Chen' },
    },
    {
      args: ['channel-human-name-set', 'group-1', '--nickname', 'Bobby'],
      method: 'channelHumanNameSet',
      input: { channelId: 'group-1', nickname: 'Bobby' },
    },
  ])('dispatches $method for the member named by --as', async ({ args, method, input }) => {
    const f = await host();
    await run(f.url, ['--as', 'bob', ...args]);
    expect(f.calls[0]).toEqual({
      path: '/api/botharness/team-as',
      input: { username: 'bob', namespace: 'botharness', method, args: input },
    });
  });
  it('never prints malformed password stdin and dispatches direct member Channel operations', async () => {
    const f = await host();
    const secret = '{secret-password-should-stay-private';
    const denied = await run(f.url, ['members', 'password', '--password-stdin'], secret);
    expect(denied.status).not.toBe(0);
    expect(denied.text + denied.errorText).not.toContain(secret);
    expect(f.calls).toHaveLength(0);
    const sent = await run(
      f.url,
      ['--as', 'bob', 'channels', 'send', 'group-1', '--body-stdin'],
      'A member message',
    );
    expect(sent.status).not.toBe(0);
    expect(f.calls[0]).toEqual({
      path: '/api/botharness/team-as',
      input: {
        username: 'bob',
        namespace: 'botharness',
        method: 'channelSend',
        args: { channelId: 'group-1', body: 'A member message' },
      },
    });
  });
  it.each([
    [
      ['members', 'roles', 'bob', '--set', 'member,reviewers'],
      'memberRolesSet',
      { humanId: 'bob-id', roleIds: ['member', 'reviewers'] },
    ],
    [['devices', '--member', 'bob'], 'memberDevices', { humanId: 'bob-id' }],
    [
      ['devices', '--member', 'bob', '--revoke', 'browser-grant'],
      'memberDeviceRevoke',
      { humanId: 'bob-id', grantId: 'browser-grant' },
    ],
    [
      ['team-mode', 'transfer-owner', 'bob', '--password-stdin', '--confirm'],
      'ownerTransfer',
      { humanId: 'bob-id', password: 'private-owner-password' },
    ],
  ] as const)('resolves usernames and dispatches %j', async (args, method, payload) => {
    const f = await host();
    const result = await run(f.url, [...args], 'private-owner-password\n');
    expect(result.status).toBe(0);
    expect(f.calls.map((call) => call.path)).toEqual([
      '/api/botharness/teamMode',
      '/api/botharness/members',
      `/api/botharness/${method}`,
    ]);
    expect(f.calls[2]?.input).toMatchObject({ payload: { args: payload } });
    expect(result.text + result.errorText).not.toContain('private-owner-password');
  });

  it.each([
    ['team-mode', 'transfer-owner', 'bob', '--password-stdin'],
    ['team-mode', 'transfer-owner', 'bob', '--confirm'],
    ['roles', 'create', '--name', 'No permissions'],
    ['devices', '--member', 'bob', '--member', 'alice'],
  ])('refuses incomplete or ambiguous M3 commands %j without mutation', async (...args) => {
    const f = await host();
    expect((await run(f.url, args, 'private-owner-password')).status).not.toBe(0);
    expect(f.calls).toEqual([]);
  });

  it.each([
    ['roles', 'list'],
    ['roles', 'catalog'],
    ['roles', 'create', '--name', 'Audit', '--permissions', 'audit.view'],
    ['roles', 'update', 'audit', '--permissions', ''],
    ['roles', 'delete', 'audit', '--confirm'],
    ['members', 'roles', 'alice', '--set', 'member'],
    ['devices', '--member', 'bob'],
    ['devices', '--member', 'bob', '--revoke', 'grant'],
    ['team-mode', 'transfer-owner', 'alice', '--password-stdin', '--confirm'],
  ])('keeps --as on the member carrier for M3 %j', async (...args) => {
    const f = await host();
    const result = await run(f.url, ['--as', 'bob', ...args], 'private-owner-password');
    expect(result.output).toMatchObject({ error: { code: 'remote-access/denied' } });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]?.path).toBe('/api/botharness/team-as');
    expect(result.text).not.toContain('private-owner-password');
  });

  it.each([false, true])(
    'refuses role deletion without confirmation before RPC (as member: %s)',
    async (member) => {
      const f = await host();
      const result = await run(f.url, [
        ...(member ? ['--as', 'bob'] : []),
        'roles',
        'delete',
        'reviewers',
      ]);
      expect(result.status).not.toBe(0);
      expect(result.output).toMatchObject({ error: { code: 'confirm-required' } });
      expect(f.calls).toEqual([]);
    },
  );

  it('admits certificate-verified private LAN HTTPS for the local Owner CLI', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if ((init?.method ?? 'GET') === 'GET')
        return new Response(null, {
          status: 302,
          headers: { 'set-cookie': 'authority=test-owner; HttpOnly; Secure' },
        });
      expect(url.origin).toBe('https://192.168.1.20');
      return Response.json({
        type: 'server-response',
        result: { ok: true, value: fakeTeamMode() },
      });
    });
    const result = await run('https://192.168.1.20', ['team-mode', 'status']);
    expect(result.status).toBe(0);
    const plain = await run('http://192.168.1.20', ['team-mode', 'status']);
    expect(plain.status).not.toBe(0);
  });
});
