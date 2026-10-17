import { describe, expect, it } from 'vitest';
import {
  CloudClient,
  callbackCode,
  parseCloudQr,
  configurationChanges,
  type CloudRuntime,
} from '../src/cloud/client';
import { MOBILE_REDIRECT_URI, publicInstance } from '../src/cloud/instance-contract';
import { cloudNativeIntent } from '../src/cloud/native-intent';
const config = publicInstance({
  instanceId: 'tob-test-uat',
  environment: 'uat',
  server: 'https://tob.example.test',
  clientId: 'client_test',
  issuer: 'https://api.workos.com/user_management/client_test',
  authkitDomain: 'example-staging.authkit.app',
  mobileRedirectUri: MOBILE_REDIRECT_URI,
});
const token = 'header.' + btoa(JSON.stringify({ exp: 4000000000 })) + '.signature';
function fixture() {
  let storage: string | null = null;
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const state = {
    drift: false,
    offline: false,
    failWrite: false,
    refreshError: 0,
    wrongState: false,
    cancelled: false,
    tokenNumber: 0,
    browserUrl: '',
    user: 'user_test',
  };
  const response = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
  const rt: CloudRuntime = {
    read: async () => storage,
    write: async (value) => {
      if (state.failWrite) throw Error('private platform error');
      storage = value;
    },
    now: () => 1000000,
    random: () => 'random-verifier-or-state-43-characters-00000000',
    challenge: async () => 's256-challenge',
    authorize: async (url) => {
      state.browserUrl = url;
      return state.cancelled
        ? null
        : MOBILE_REDIRECT_URI +
            '?code=authorization-code&state=' +
            (state.wrongState ? 'wrong' : new URL(url).searchParams.get('state'));
    },
    request: async (url, init) => {
      calls.push({ url, init });
      if (state.offline) throw Error('network');
      if (url.endsWith('/.well-known/open-cloud-groups'))
        return response({
          ...config,
          auth: { ...config.auth, mobileRedirectUris: state.drift ? [] : [MOBILE_REDIRECT_URI] },
        });
      if (url === config.auth.tokenEndpoint) {
        if (
          new URLSearchParams(String(init?.body)).get('grant_type') === 'refresh_token' &&
          state.refreshError
        )
          return response(
            { error: state.refreshError === 400 ? 'invalid_grant' : 'temporarily_unavailable' },
            state.refreshError,
          );
        return response({
          access_token: token,
          refresh_token: 'secret-refresh-' + ++state.tokenNumber,
        });
      }
      if (url.endsWith('/api/me'))
        return response({
          userId: state.user,
          instanceId: config.instanceId,
          instanceRole: 'admin',
        });
      if (url.endsWith('/api/auth/logout')) return response({ remoteRevoked: true });
      throw Error('unexpected request');
    },
  };
  const client = new CloudClient(rt);
  return { client, rt, calls, state, stored: () => storage };
}
async function loggedIn() {
  const f = fixture();
  await f.client.importConfig(JSON.stringify(config));
  await f.client.login(config.instanceId);
  return f;
}
describe('mobile cloud session boundary', () => {
  it('imports, performs public PKCE, persists rotation, verifies identity, restores and logs out', async () => {
    const f = await loggedIn();
    const auth = new URL(f.state.browserUrl);
    expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
    expect(auth.searchParams.get('redirect_uri')).toBe(MOBILE_REDIRECT_URI);
    const exchange = f.calls.find((c) => c.url === config.auth.tokenEndpoint)!;
    expect(new URLSearchParams(String(exchange.init?.body)).get('code_verifier')).toBe(
      f.rt.random(),
    );
    expect(f.client.getSnapshot().rows[0]?.identity?.instanceRole).toBe('admin');
    await f.client.refresh(config.instanceId);
    expect(f.stored()).toContain('secret-refresh-2');
    const restored = new CloudClient(f.rt);
    await restored.load();
    expect(restored.getSnapshot().rows[0]?.identity).toBeUndefined();
    await restored.whoami(config.instanceId);
    expect(await restored.logout(config.instanceId)).toEqual({
      localLoggedOut: true,
      remoteRevoked: true,
    });
    expect(f.stored()).not.toContain('secret-refresh');
    expect(JSON.stringify(restored.getSnapshot())).not.toContain(token);
    expect(
      f.calls.every((c) => c.init?.redirect === 'error' && c.init.credentials === 'omit'),
    ).toBe(true);
  });
  it.each(['wrongState', 'cancelled'] as const)('does not exchange tokens for %s', async (key) => {
    const f = fixture();
    await f.client.importConfig(JSON.stringify(config));
    f.state[key] = true;
    await expect(f.client.login(config.instanceId)).rejects.toThrow();
    expect(f.calls.some((c) => c.url === config.auth.tokenEndpoint)).toBe(false);
    expect(f.client.getSnapshot().rows[0]?.hasSession).toBe(false);
  });
  it('refuses configuration drift before credentials and still removes only the local session on logout', async () => {
    const f = await loggedIn();
    f.state.drift = true;
    f.calls.length = 0;
    await expect(f.client.refresh(config.instanceId)).rejects.toThrow('INSTANCE_CONFIG_CHANGED');
    expect(f.calls.every((c) => c.url.endsWith('/.well-known/open-cloud-groups'))).toBe(true);
    expect(await f.client.logout(config.instanceId)).toEqual({
      localLoggedOut: true,
      remoteRevoked: false,
    });
    expect(f.stored()).not.toContain(token);
  });
  it('keeps rotated credentials after transient errors, clears revoked credentials, never grants cached identity on mismatch', async () => {
    const f = await loggedIn();
    f.state.refreshError = 503;
    await expect(f.client.refresh(config.instanceId)).rejects.toThrow('AUTH_RETRY_REQUIRED');
    expect(f.stored()).toContain('secret-refresh-1');
    f.state.refreshError = 0;
    f.state.user = 'user_other';
    await expect(f.client.refresh(config.instanceId)).rejects.toThrow('IDENTITY_RESPONSE_MISMATCH');
    expect(f.client.getSnapshot().rows[0]?.identity).toBeUndefined();
    expect(f.stored()).toContain('secret-refresh-2');
    f.state.refreshError = 400;
    await expect(f.client.refresh(config.instanceId)).rejects.toThrow('LOGIN_REQUIRED');
    expect(f.client.getSnapshot().rows[0]?.hasSession).toBe(false);
  });
  it('reports storage failure without claiming logout and does not disclose raw errors', async () => {
    const f = await loggedIn();
    f.state.failWrite = true;
    await expect(f.client.logout(config.instanceId)).rejects.toThrow('STORAGE_UNAVAILABLE');
    expect(f.client.getSnapshot().rows[0]?.hasSession).toBe(true);
    expect(f.client.getSnapshot().error).toBe('STORAGE_UNAVAILABLE');
  });
  it('serializes browser transactions and refuses concurrent refresh/logout', async () => {
    const f = fixture();
    await f.client.importConfig(JSON.stringify(config));
    let release: (v: string | null) => void = () => {};
    f.rt.authorize = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const login = f.client.login(config.instanceId);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(f.client.logout(config.instanceId)).rejects.toThrow('SESSION_BUSY');
    release(null);
    await expect(login).rejects.toThrow('LOGIN_CANCELLED');
  });
  it('does not fetch arbitrary QR URLs and strips cold callback secrets from navigation', () => {
    expect(() => parseCloudQr('https://untrusted.test/config.json')).toThrow(
      'INVALID_INSTANCE_CONFIG',
    );
    expect(() => parseCloudQr(JSON.stringify({ ...config, secret: 'unexpected' }))).toThrow();
    expect(() => callbackCode(MOBILE_REDIRECT_URI + '?code=x&state=s&state=s', 's')).toThrow();
    expect(cloudNativeIntent(MOBILE_REDIRECT_URI + '?code=secret&state=private')).toBe(
      '/cloud-services',
    );
    expect(cloudNativeIntent('deepseekbot://pair?p=host')).toBe('deepseekbot://pair?p=host');
  });
  it('bounds an untrusted discovery body even without content-length', async () => {
    const f = fixture();
    f.rt.request = async () => new Response(' '.repeat(65537));
    await expect(f.client.importConfig(JSON.stringify(config))).rejects.toThrow('INVALID_RESPONSE');
  });
  it('requires confirmation for critical replacement, preserves unchanged sessions and other instances', async () => {
    const f = await loggedIn();
    await f.client.importConfig(JSON.stringify(config));
    expect(f.client.getSnapshot().rows[0]?.hasSession).toBe(true);
    const other = { ...config, instanceId: 'other-uat', server: 'https://other.example.test' };
    const vault = JSON.parse(f.stored()!);
    vault.entries.push({
      config: other,
      session: { accessToken: token, refreshToken: 'other-private-refresh' },
    });
    await f.rt.write(JSON.stringify(vault));
    const restored = new CloudClient(f.rt);
    await restored.load();
    const next = { ...config, auth: { ...config.auth, authkitDomain: 'new-staging.authkit.app' } };
    expect(configurationChanges(config, next)).toEqual([
      {
        field: 'authkitDomain',
        previous: config.auth.authkitDomain,
        next: next.auth.authkitDomain,
      },
    ]);
    await expect(restored.importConfig(JSON.stringify(next))).rejects.toThrow(
      'CONFIG_REPLACEMENT_REQUIRED',
    );
    const original = f.rt.request;
    f.rt.request = async (url, init) =>
      url === config.server + '/.well-known/open-cloud-groups'
        ? new Response(JSON.stringify(next))
        : original(url, init);
    await restored.importConfig(JSON.stringify(next), true);
    expect(
      restored.getSnapshot().rows.find((row) => row.config.instanceId === config.instanceId)
        ?.hasSession,
    ).toBe(false);
    expect(
      restored.getSnapshot().rows.find((row) => row.config.instanceId === other.instanceId)
        ?.hasSession,
    ).toBe(true);
    expect(f.stored()).toContain('other-private-refresh');
  });
  it('rejects expired transactions before token exchange', async () => {
    const f = fixture();
    await f.client.importConfig(JSON.stringify(config));
    let time = 1;
    f.rt.now = () => time;
    f.rt.authorize = async (url) => {
      time += 600001;
      return MOBILE_REDIRECT_URI + '?code=private&state=' + new URL(url).searchParams.get('state');
    };
    await expect(f.client.login(config.instanceId)).rejects.toThrow('LOGIN_EXPIRED');
    expect(f.calls.some((c) => c.url === config.auth.tokenEndpoint)).toBe(false);
  });
});
