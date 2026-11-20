import { TEAM_PATH } from '../src/team/http.js';
import { createManagedTlsIngress } from '../src/devices/managed-tls-ingress.js';
import { afterEach, describe, expect, it } from 'vitest';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { closes, enabledFixture, memberHttp, cleanup } from './team-mode-fixtures.js';

afterEach(cleanup);

describe('member HTTP carrier', { timeout: 60_000 }, () => {
  it('admits browser sign-in only through the managed listener and uses HTTPS origin and Secure cookies', async () => {
    const f = await enabledFixture();
    const main = await memberHttp(f);
    const ingress = createManagedTlsIngress({ port: Number(new URL(main.origin).port) });
    closes.push(() => ingress.close());
    const origin = `http://127.0.0.1:${await ingress.start()}`;
    const headers = {
      'x-forwarded-for': '192.0.2.5',
      'x-forwarded-proto': 'https',
      'x-botharness-device-route': 'managed-tls',
    };
    for (const tag of ['managed-tls', 'connect', 'tailscale']) {
      const denied = await main.signIn('bob', f.initialPassword, {
        ...headers,
        'x-botharness-device-route': tag,
      });
      expect(denied.status).toBe(403);
      expect(await denied.json()).toEqual({ code: 'insecure-transport' });
    }
    const result = await fetch(`${origin}${TEAM_PATH}/sign-in`, {
      method: 'POST',
      headers: {
        ...headers,
        origin: origin.replace('http:', 'https:'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ username: 'bob', password: f.initialPassword }),
    });
    expect(result.status).toBe(200);
    expect(result.headers.get('set-cookie')).toContain('; Secure');
    expect(await result.json()).toMatchObject({ humanId: f.human.humanId });
  });
  it('serves the nonce-protected sign-in page and loopback member cookie, then dispatches calls as the member', async () => {
    const f = await enabledFixture();
    const http = await memberHttp(f);
    const page = await fetch(`${http.origin}${TEAM_PATH}/`);
    const html = await page.text();
    expect(page.headers.get('cache-control')).toBe('no-store');
    expect(page.headers.get('x-frame-options')).toBe('DENY');
    const nonce = /script-src 'nonce-([^']+)'/u.exec(
      page.headers.get('content-security-policy') ?? '',
    )?.[1];
    expect(nonce).toBeTruthy();
    expect(html).toContain(`nonce="${nonce}"`);
    const login = await http.signIn('bob', f.initialPassword);
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(await login.json()).toMatchObject({
      humanId: f.human.humanId,
      displayName: 'Bob',
      mustChangePassword: true,
    });
    const forced = await fetch(`${http.origin}${TEAM_PATH}/`, { headers: { cookie } });
    const forcedHtml = await forced.text();
    expect(forcedHtml).toContain('data-step="change-password"');
    expect(forcedHtml).toContain('Bob');
    expect(forcedHtml).not.toContain('__DSH_TRANSPORT__');
    expect(forced.headers.get('cache-control')).toBe('no-store');
    expect(forced.headers.get('x-frame-options')).toBe('DENY');
    const forcedNonce = /script-src 'nonce-([^']+)'/u.exec(
      forced.headers.get('content-security-policy') ?? '',
    )?.[1];
    expect(forcedNonce).toBeTruthy();
    expect(forcedHtml).toContain(`nonce="${forcedNonce}"`);
    const rpc = async (method: string, args = {}) => {
      const answer = await fetch(`${http.origin}${TEAM_PATH}/__share/rpc`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          op: 'call',
          path: `/api/botharness/${method}`,
          body: {
            type: 'client-request',
            rpcId: 'test',
            method: `botharness/${method}`,
            payload: { args },
          },
        }),
      });
      return answer.json();
    };
    expect(await rpc('teamMode')).toMatchObject({
      result: { ok: true, value: { viewer: { humanId: f.human.humanId, kind: 'member' } } },
    });
    expect(await rpc('channels')).toMatchObject({
      result: { ok: false, error: { code: 'password-change-required' } },
    });
    expect(
      await rpc('memberPasswordChange', { current: f.initialPassword, next: 'member-password-1' }),
    ).toMatchObject({ result: { ok: true } });
    expect(await rpc('channels')).toMatchObject({ result: { ok: true, value: { channels: [] } } });
    const shell = await fetch(`${http.origin}${TEAM_PATH}/`, { headers: { cookie } });
    expect(await shell.text()).toContain('__DSH_TRANSPORT__');
    const ownerHttp = await fetch(`${http.origin}${TEAM_PATH}/api/botharness/appearance-control`, {
      headers: { cookie },
    });
    expect(ownerHttp.status).toBe(403);
    expect(await ownerHttp.json()).toEqual({ code: 'remote-access/denied' });
    const out = await fetch(`${http.origin}${TEAM_PATH}/sign-out`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(out.status).toBe(200);
    const after = await fetch(`${http.origin}${TEAM_PATH}/`, { headers: { cookie } });
    expect(await after.text()).toContain('data-step="sign-in"');
  });

  it('refuses spoofed TLS headers, permits only the Owner exception, and denies cross-origin sign-in', async () => {
    const f = await enabledFixture();
    const http = await memberHttp(f, true);
    const denied = await http.signIn('bob', f.initialPassword, { 'x-forwarded-proto': 'https' });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ code: 'insecure-transport' });
    f.team.setInsecureHttp(owner, true);
    const allowed = await http.signIn('bob', f.initialPassword);
    expect(allowed.status).toBe(200);
    const cross = await http.signIn('bob', f.initialPassword, {
      origin: 'https://attacker.example',
    });
    expect(cross.status).toBe(403);
    expect(await cross.json()).toEqual({ code: 'origin-refused' });
  });

  it('uses Secure for Host-known TLS and refuses new sign-ins after Team mode is disabled', async () => {
    const f = await enabledFixture();
    const http = await memberHttp(f, true, true);
    const login = await http.signIn('bob', f.initialPassword);
    expect(login.status).toBe(200);
    expect(login.headers.get('set-cookie')).toContain('; Secure');
    await f.team.setMode(owner, false);
    const denied = await http.signIn('bob', f.initialPassword);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ code: 'team-mode-off' });
  });

  it('changes the one-time password over HTTP before serving the shell', async () => {
    const f = await enabledFixture();
    const http = await memberHttp(f);
    const login = await http.signIn('bob', f.initialPassword);
    const cookie = login.headers.get('set-cookie') ?? '';
    const changed = await http.password(cookie, f.initialPassword, 'member-password-1');
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual({});
    expect(changed.headers.get('cache-control')).toBe('no-store');
    expect(f.team.member(f.human.humanId)?.mustChangePassword).toBe(false);
    const shell = await fetch(`${http.origin}${TEAM_PATH}/`, { headers: { cookie } });
    expect(await shell.text()).toContain('__DSH_TRANSPORT__');
    await expect(f.team.signIn('bob', 'member-password-1', 'another-ip')).resolves.toMatchObject({
      member: { mustChangePassword: false },
    });
    const reused = await http.password(cookie, 'member-password-1', f.initialPassword);
    expect(reused.status).toBe(409);
    expect(await reused.json()).toEqual({ code: 'password-reused' });
  });

  it.each([
    ['wrong-current', 401, 'credentials-invalid'],
    ['weak', 400, 'password-weak'],
    ['reused', 409, 'password-reused'],
  ] as const)('refuses HTTP password change: %s', async (kind, status, code) => {
    const f = await enabledFixture();
    const http = await memberHttp(f);
    const login = await http.signIn('bob', f.initialPassword);
    const cookie = login.headers.get('set-cookie') ?? '';
    const answer = await http.password(
      cookie,
      kind === 'wrong-current' ? 'wrong-password' : f.initialPassword,
      kind === 'weak' ? 'short' : kind === 'reused' ? f.initialPassword : 'member-password-1',
    );
    expect(answer.status).toBe(status);
    expect(await answer.json()).toEqual({ code });
    expect(f.team.member(f.human.humanId)?.mustChangePassword).toBe(true);
  });

  it.each(['absent', 'revoked', 'suspended', 'mode-off'] as const)(
    'refuses HTTP password changes without a live member grant: %s',
    async (kind) => {
      const f = await enabledFixture();
      const http = await memberHttp(f);
      const login = await http.signIn('bob', f.initialPassword);
      const cookie = kind === 'absent' ? '' : (login.headers.get('set-cookie') ?? '');
      if (kind === 'revoked') {
        const peer = f.peers[0];
        if (peer?.principal.kind !== 'botharness-member') throw new Error('missing member');
        await f.team.revoke(peer.principal.grantId);
      }
      if (kind === 'suspended') await f.team.suspend(owner, f.human.humanId);
      if (kind === 'mode-off') await f.team.setMode(owner, false);
      const answer = await http.password(cookie, f.initialPassword, 'member-password-1');
      expect(answer.status).toBe(401);
      expect(await answer.json()).toEqual({ code: 'credentials-invalid' });
      expect(f.team.member(f.human.humanId)?.mustChangePassword).toBe(true);
    },
  );

  it('applies sign-in transport and origin checks to HTTP password changes', async () => {
    const f = await enabledFixture();
    const local = await memberHttp(f);
    const cookie = (await local.signIn('bob', f.initialPassword)).headers.get('set-cookie') ?? '';
    const remote = await memberHttp(f, true);
    const denied = await remote.password(cookie, f.initialPassword, 'member-password-1', {
      'x-forwarded-proto': 'https',
    });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ code: 'insecure-transport' });
    const proxy = await local.password(cookie, f.initialPassword, 'member-password-1', {
      forwarded: 'for=192.0.2.5',
    });
    expect(proxy.status).toBe(403);
    const cross = await local.password(cookie, f.initialPassword, 'member-password-1', {
      origin: 'https://attacker.example',
    });
    expect(cross.status).toBe(403);
    expect(await cross.json()).toEqual({ code: 'origin-refused' });
    f.team.setInsecureHttp(owner, true);
    expect((await remote.password(cookie, f.initialPassword, 'member-password-1')).status).toBe(
      200,
    );
    const tls = await memberHttp(f, true, true);
    expect((await tls.password(cookie, 'member-password-1', 'member-password-2')).status).toBe(200);
    const connect = await memberHttp(f, true, false, true);
    f.team.setInsecureHttp(owner, false);
    expect((await connect.password(cookie, 'member-password-2', 'member-password-3')).status).toBe(
      200,
    );
  });

  it('shares username and IP rate-limit budgets between sign-in and HTTP password changes', async () => {
    let now = Date.parse('2026-11-14T00:00:00Z');
    const f = await enabledFixture({ now: () => now });
    const http = await memberHttp(f);
    const cookie = (await http.signIn('bob', f.initialPassword)).headers.get('set-cookie') ?? '';
    for (let i = 0; i < 4; i++)
      expect((await http.password(cookie, 'wrong-current', 'member-password-1')).status).toBe(401);
    const signInLimited = await http.signIn('bob', f.initialPassword);
    expect(signInLimited.status).toBe(429);
    expect(await signInLimited.json()).toEqual({ code: 'rate-limited', retryAfterSeconds: 60 });
    now += 60_000;
    for (let i = 0; i < 4; i++)
      expect((await http.signIn('bob', 'wrong-password')).status).toBe(401);
    expect((await http.signIn('bob', f.initialPassword)).status).toBe(200);
    const passwordLimited = await http.password(cookie, f.initialPassword, 'member-password-1');
    expect(passwordLimited.status).toBe(429);
    expect(await passwordLimited.json()).toEqual({ code: 'rate-limited', retryAfterSeconds: 60 });
    now += 60_000;
    for (let i = 0; i < 20; i++)
      expect((await http.signIn(`unknown-${i}`, 'wrong-password')).status).toBe(401);
    const ipLimited = await http.password(cookie, f.initialPassword, 'member-password-1');
    expect(ipLimited.status).toBe(429);
    expect(await ipLimited.json()).toEqual({ code: 'rate-limited', retryAfterSeconds: 60 });
    expect(f.team.member(f.human.humanId)?.mustChangePassword).toBe(true);
  });
});
