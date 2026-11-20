import { readFileSync, writeFileSync } from 'node:fs';

const statePath = process.env.BOTHARNESS_CONNECT_QA_STATE;
const relay = 'https://connect-recovery.invalid';
if (!statePath) throw new Error('BOTHARNESS_CONNECT_QA_STATE is required for this test fixture');
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (
    !url.startsWith(`${relay}/`) &&
    url !== 'https://api.workos.com/user_management/authorize/device' &&
    url !== 'https://api.workos.com/user_management/authenticate'
  )
    return originalFetch(input, init);
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const path = new URL(url).pathname;
  const method = init?.method ?? 'GET';
  const form = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
  const operation = path.endsWith('/authenticate') ? form.get('grant_type') : `${method} ${path}`;
  state.counts ??= {};
  state.counts[operation] = (state.counts[operation] ?? 0) + 1;
  const finish = (body, status = 200) => {
    writeFileSync(statePath, JSON.stringify(state, null, 2));
    return Response.json(body, { status });
  };
  if (path === '/v1/config')
    return finish({
      clientId: 'client_3567QA',
      deviceAuthorizationEndpoint: 'https://api.workos.com/user_management/authorize/device',
      tokenEndpoint: 'https://api.workos.com/user_management/authenticate',
      zone: 'deepseekbot.dev',
    });
  if (path.endsWith('/authorize/device'))
    return finish({
      device_code: 'synthetic-device-code',
      user_code: 'QA35-67OK',
      verification_uri: 'https://example.invalid/qa',
      interval: 1,
      expires_in: 60,
    });
  if (path.endsWith('/authenticate')) {
    if (
      state.mode === 'authorization-transient' &&
      operation !== 'refresh_token' &&
      state.counts[operation] === 1
    )
      return finish({}, 503);
    return finish({
      access_token: 'synthetic-access',
      refresh_token: 'synthetic-refresh',
      user: { id: 'synthetic-account', email: 'connect-qa@example.invalid' },
    });
  }
  if (path === '/v1/hosts' && method === 'POST') {
    if (state.mode === 'registration-failure') return finish({}, 503);
    state.registered = true;
    return finish({ host: { id: 'hconnectqa3567' } }, 201);
  }
  if (path === '/v1/hosts' && method === 'GET') {
    if (state.mode === 'ownership-failure') return finish({}, 503);
    return finish({ hosts: state.registered ? [{ id: 'hconnectqa3567' }] : [] });
  }
  if (path.endsWith('/tunnel')) return finish({}, 503);
  if (method === 'DELETE') {
    state.registered = false;
    return finish({ ok: true });
  }
  throw new Error(`Unimplemented Connect QA fixture operation: ${method} ${path}`);
};
