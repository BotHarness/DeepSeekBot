import { randomUUID } from 'node:crypto';

export async function runModelProviderGate(s, { as, password }, check) {
  const owner = s.cli(['model-providers']);
  const id = owner.providers[0]?.id ?? 'opencode-go';
  const revision = owner.providers[0]?.revision ?? 0;
  const expectedRevision = owner.revision ?? 0;
  const accounts = s.cli(['engine', 'accounts']);
  const accountId = accounts.accounts[0]?.id ?? 'codex-default';
  const accountRevision = accounts.revision ?? 0;
  const testKey = 'm15-unused-test-key';
  for (const args of [
    ['model-providers'],
    ['engine', 'accounts'],
    [
      'engine',
      'account-add',
      'codex',
      '--name',
      'M15',
      '--expected-revision',
      String(accountRevision),
    ],
    [
      'engine',
      'account-rename',
      accountId,
      '--name',
      'M15',
      '--expected-revision',
      String(accountRevision),
    ],
    [
      'engine',
      'account-remove',
      accountId,
      '--confirm',
      '--expected-revision',
      String(accountRevision),
    ],
    ['engine', 'login', accountId],
    [
      'model-provider-add',
      '--template',
      'opencode-go',
      '--name',
      'M15',
      '--key-stdin',
      '--expected-revision',
      String(expectedRevision),
    ],
    ['model-provider-edit', id, '--key-stdin', '--expected-revision', String(revision)],
    ['model-provider-remove', id, '--confirm', '--expected-revision', String(revision)],
  ]) {
    const result = s.cli(args, {
      as,
      input: args.includes('--key-stdin') ? testKey : undefined,
      allowFail: true,
    });
    check(
      `CLI ${args[0] === 'engine' ? args.slice(0, 2).join(' ') : args[0]} refused without disclosure`,
      result?.error?.code === 'permission-required' && !JSON.stringify(result).includes(testKey),
      result?.error?.code,
    );
  }

  const path = s.url.origin + '/botharness-device/team';
  const headers = { origin: s.url.origin, 'content-type': 'application/json' };
  const signedIn = await fetch(path + '/sign-in', {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: as, password }),
  });
  const cookie = signedIn.headers.get('set-cookie')?.split(';')[0];
  if (!signedIn.ok || !cookie) throw new Error(`Member sign-in failed (HTTP ${signedIn.status})`);
  const memberHeaders = { ...headers, cookie };
  try {
    for (const [method, args] of [
      ['modelProviders', {}],
      ['engineAccounts', {}],
      ['engineAccountAdd', { engine: 'codex', name: 'M15', expectedRevision: accountRevision }],
      ['engineAccountRename', { id: accountId, name: 'M15', expectedRevision: accountRevision }],
      ['engineAccountRemove', { id: accountId, confirm: true, expectedRevision: accountRevision }],
      ['engineAccountLogin', { id: accountId }],
      [
        'modelProviderAdd',
        { template: 'opencode-go', name: 'M15', key: testKey, expectedRevision },
      ],
      ['modelProviderEdit', { id, key: testKey, expectedRevision: revision }],
      ['modelProviderRemove', { id, expectedRevision: revision }],
    ]) {
      const endpoint = `botharness/${method}`;
      const response = await fetch(path + '/__share/rpc', {
        method: 'POST',
        headers: memberHeaders,
        body: JSON.stringify({
          op: 'call',
          path: `/api/${endpoint}`,
          body: {
            type: 'client-request',
            rpcId: randomUUID(),
            method: endpoint,
            payload: { args },
          },
        }),
      });
      const { result } = await response.json();
      check(
        `Member bridge ${method} refused without disclosure`,
        result?.ok === false &&
          result.error?.code === 'permission-required' &&
          !JSON.stringify(result).includes(testKey),
        result?.error?.code,
      );
    }
  } finally {
    await fetch(path + '/sign-out', {
      method: 'POST',
      headers: memberHeaders,
      signal: AbortSignal.timeout(10_000),
    });
  }
  check(
    'Denied writes left subscription accounts intact',
    JSON.stringify(s.cli(['engine', 'accounts']).accounts) === JSON.stringify(accounts.accounts),
  );
  check(
    'Denied writes left provider settings intact',
    JSON.stringify(s.cli(['model-providers'])) === JSON.stringify(owner),
  );
}
