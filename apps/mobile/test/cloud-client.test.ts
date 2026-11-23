import { describe, expect, it } from 'vitest';
import { CloudClient, callbackCode, parseCloudQr, configurationChanges } from '../src/cloud/client';
import { MOBILE_REDIRECT_URI } from '../src/cloud/instance-contract';
import { cloudViewScope } from '../src/cloud/workspace-directory';
import { cloudNativeIntent } from '../src/cloud/native-intent';

import { config, fixture, loggedIn, token } from './cloud-client-fixtures';

describe('mobile cloud session boundary', () => {
  it('renames a connection locally without changing credentials or trusted connection scope', async () => {
    const f = await loggedIn();
    const before = f.client.getSnapshot().rows[0]!;
    const stored = JSON.parse(f.stored()!);
    const requestCount = f.calls.length;
    f.state.offline = true;
    await f.client.rename(config.instanceId, '  Team UAT  ');
    const after = f.client.getSnapshot().rows[0]!;
    expect(after.config.name).toBe('Team UAT');
    expect(cloudViewScope(after)).toBe(cloudViewScope(before));
    expect(after.identity).toEqual(before.identity);
    expect(JSON.parse(f.stored()!).entries[0].session).toEqual(stored.entries[0].session);
    expect(f.calls).toHaveLength(requestCount);
    const reopened = new CloudClient(f.rt);
    await reopened.load();
    expect(reopened.getSnapshot().rows[0]?.config.name).toBe('Team UAT');
    expect(reopened.getSnapshot().rows[0]?.hasSession).toBe(true);
  });

  it('refuses invalid names and preserves the previous name when storage fails', async () => {
    const f = await loggedIn();
    const before = f.stored();
    await expect(f.client.rename(config.instanceId, '  ')).rejects.toMatchObject({
      code: 'INVALID_INSTANCE_CONFIG',
    });
    await expect(f.client.rename(config.instanceId, 'bad\nname')).rejects.toMatchObject({
      code: 'INVALID_INSTANCE_CONFIG',
    });
    f.state.failWrite = true;
    await expect(f.client.rename(config.instanceId, 'New name')).rejects.toMatchObject({
      code: 'STORAGE_UNAVAILABLE',
    });
    expect(f.stored()).toBe(before);
    expect(f.client.getSnapshot().rows[0]?.config.name).toBe(config.name);
  });

  it('accepts a local display name during verified configuration import', async () => {
    const f = fixture();
    await f.client.importConfig(JSON.stringify({ ...config, name: 'My cloud' }));
    expect(f.client.getSnapshot().rows[0]?.config).toEqual({ ...config, name: 'My cloud' });
    expect(f.calls.some((call) => call.url.endsWith('/.well-known/open-cloud-groups'))).toBe(true);
  });

  it('keeps draft scope stable through refresh but separates a later signed-in account', async () => {
    const f = fixture();
    await f.client.importConfig(JSON.stringify(config));
    await f.client.login(config.instanceId);
    const original = cloudViewScope(f.client.getSnapshot().rows[0]);
    const scopes: string[] = [];
    let unverifiedDuringRefresh = false;
    const stop = f.client.subscribe(() => {
      const row = f.client.getSnapshot().rows[0];
      scopes.push(cloudViewScope(row));
      if (!row?.identity) unverifiedDuringRefresh = true;
    });
    await f.client.refresh(config.instanceId);
    stop();
    expect(unverifiedDuringRefresh).toBe(true);
    expect(new Set(scopes)).toEqual(new Set([original]));
    const restored = new CloudClient(f.rt);
    await restored.load();
    expect(restored.getSnapshot().rows[0]?.identity).toBeUndefined();
    expect(cloudViewScope(restored.getSnapshot().rows[0])).toBe(original);
    await restored.logout(config.instanceId);
    expect(cloudViewScope(restored.getSnapshot().rows[0])).not.toBe(original);
    f.state.user = 'user_other';
    await restored.login(config.instanceId);
    expect(restored.getSnapshot().rows[0]?.sessionUserId).toBe('user_other');
    expect(cloudViewScope(restored.getSnapshot().rows[0])).not.toBe(original);
  });

  it('imports, performs public PKCE, persists rotation, verifies identity, restores and logs out', async () => {
    const f = await loggedIn();
    const auth = new URL(f.state.browserUrl);
    expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
    expect(auth.searchParams.get('max_age')).toBe('0');
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

it('ordinary user onboarding retains a retryable session and does not display administrator authority', async () => {
  const f = fixture();
  f.state.instanceRole = 'user';
  f.state.onboardingError = true;
  await f.client.importConfig(JSON.stringify(config));
  await expect(f.client.login(config.instanceId)).rejects.toThrow('ONBOARDING_INCOMPLETE');
  expect(f.stored()).toContain('secret-refresh');
  f.state.onboardingError = false;
  expect(await f.client.whoami(config.instanceId)).toMatchObject({ instanceRole: 'user' });
  expect(f.calls.filter((c) => c.url.endsWith('/api/onboarding'))).toHaveLength(2);
  expect(
    f.calls
      .filter((c) => c.url.endsWith('/api/onboarding'))
      .every((c) => c.init?.method === 'POST'),
  ).toBe(true);
});
