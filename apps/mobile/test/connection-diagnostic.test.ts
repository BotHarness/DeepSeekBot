import { describe, expect, it } from 'vitest';
import {
  connectionDiagnostic,
  connectionDiagnosticReport,
  networkDiagnosticReason,
} from '../src/host/connection-diagnostic';
import { createAccountActionFixture } from '../src/host/account-action-fixture';

const app = { platform: 'ios', osVersion: '27.0', version: '1.7.0', build: '18' };

describe('account connection diagnostic boundary', () => {
  it.each([
    ['connection-diagnostics', 'pairing-offer', 502, 'relay:upstream-unavailable'],
    ['connection-diagnostics-network', 'pairing-offer', undefined, 'relay:socket-dns'],
    ['connection-diagnostics-session', 'sign-in-session', 502, 'relay:http-502'],
    ['connection-diagnostics-invalid', 'pairing-offer', 200, 'relay:invalid-response'],
  ] as const)(
    'retains %s request failure without response bodies or credentials',
    async (scenario, phase, status, detail) => {
      const fixture = createAccountActionFixture(scenario);
      expect((await fixture.account.hosts()).ok).toBe(true);
      const result = await fixture.account.offer('hstudio', 'QA phone');
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected refusal');
      expect(result.diagnostic).toMatchObject({ code: 'relay-unavailable', phase, detail });
      expect(result.diagnostic?.status).toBe(status);
      const report = connectionDiagnosticReport(result.diagnostic!, app);
      expect(report).toContain(`stage: ${phase}`);
      expect(report).toContain(`detail: ${detail}`);
      expect(report).not.toMatch(
        /fixture-secret|Authorization|private\.fixture|token=|access_token|refresh_token/u,
      );
      expect(Number.isNaN(Date.parse(result.diagnostic!.occurredAt))).toBe(false);
    },
  );

  it('retains list-refresh HTTP failures independently of pairing', async () => {
    const fixture = createAccountActionFixture('connection-diagnostics-list');
    expect((await fixture.account.hosts()).ok).toBe(true);
    const result = await fixture.account.hosts();
    expect(result).toMatchObject({
      ok: false,
      diagnostic: { phase: 'environment-list', status: 503, detail: 'relay:http-503' },
    });
  });

  it('drops unsafe and unknown data instead of redacting an arbitrary payload', () => {
    const failure = connectionDiagnostic({
      code: 'Bearer-private-secret',
      phase: 'pairing',
      detail: 'relay:access-secret,connect:socket-timeout:private-secret,app:storage-keychain',
      status: 999,
      occurredAt: 'not-a-date token=secret',
    });
    const report = connectionDiagnosticReport(failure, {
      ...app,
      version: 'secret-value',
      osVersion: 'url?token=secret',
    });
    expect(report).toContain('reason: unknown');
    expect(report).toContain('connect:socket-timeout,app:storage-keychain');
    expect(report).not.toMatch(/private-secret|access-secret|token=|999|secret-value/u);
  });

  it.each([
    ['DNS failed https://private.invalid?token=secret', 'socket-dns'],
    ['Error Domain=NSURLErrorDomain Code=-1009 token=secret', 'nsurl-1009'],
    ['TLS failed password=secret', 'socket-tls'],
    ['socket-private-secret', 'socket-error'],
  ])('extracts only a known network category from %s', (text, expected) => {
    expect(networkDiagnosticReason(new Error(text))).toBe(expected);
  });
});

it.each([
  ['ENOTFOUND', 'socket-dns'],
  ['EAI_AGAIN', 'socket-dns'],
  ['ECONNREFUSED', 'socket-refused'],
  ['ETIMEDOUT', 'socket-timeout'],
  ['ECONNRESET', 'socket-reset'],
  ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'socket-tls'],
])(
  'keeps coded %s causes from opaque request failures without leaking the cause message',
  (code, expected) => {
    const cause = Object.assign(new Error('private-host.example/?token=secret'), { code });
    expect(networkDiagnosticReason(new Error('request failed', { cause }))).toBe(expected);
    expect(networkDiagnosticReason(cause)).toBe(expected);
  },
);

it('does not let an opaque wrapper code hide a specific DNS cause', () => {
  const error = Object.assign(new Error('request failed', { cause: { code: 'ENOTFOUND' } }), {
    code: 'ERR_NETWORK',
  });
  expect(networkDiagnosticReason(error)).toBe('socket-dns');
});
