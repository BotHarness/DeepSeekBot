import { expect, it, vi } from 'vitest';
import { createAppearanceControl } from '../src/appearance/control.js';
import { CLIENT_SETTINGS_COMMANDS, runClientSettings } from '../src/cli/cli-client-settings.js';
import { CliLiveError } from '../src/cli/cli-live-error.js';
import { CLI_EFFECTS } from '../src/kernel/cli-effects.js';

const request = (body: unknown) =>
  new Request('http://localhost/api/botharness/appearance-control', {
    method: 'POST',
    body: JSON.stringify(body),
  });

it('delivers a revision-bound settings write only to the selected Client and keeps the conflict owner', async () => {
  const host = createAppearanceControl();
  const a = await (await host.fetch(request({ action: 'register', platform: 'web' }))).json();
  const b = await (await host.fetch(request({ action: 'register', platform: 'desktop' }))).json();
  const ap = host.fetch(request({ action: 'poll', ...a }));
  const bp = host.fetch(request({ action: 'poll', ...b }));
  await Promise.resolve();
  const settings = {
    domain: 'shortcuts',
    patch: { action: 'help', reset: true },
  };
  const response = host.fetch(
    request({
      action: 'request',
      clientId: a.clientId,
      expiresAt: Date.now() + 5000,
      settings,
      expectedRevision: 'r1',
    }),
  );
  const { command } = await (await ap).json();
  expect(command).toMatchObject({ settings, expectedRevision: 'r1' });
  await host.fetch(
    request({
      action: 'reply',
      ...a,
      requestId: command.id,
      result: {
        error: {
          code: 'shortcut-conflict',
          message: 'shortcut-conflict: settings',
        },
      },
    }),
  );
  const refused = await response;
  expect(refused.status).toBe(409);
  expect(await refused.json()).toEqual({
    error: {
      code: 'shortcut-conflict',
      message: 'shortcut-conflict: settings',
    },
  });
  host.dispose();
  expect(await (await bp).json()).toEqual({ command: null });
});

it('refuses settings writes without a revision and settings requests without a live deadline', async () => {
  const host = createAppearanceControl();
  const a = await (await host.fetch(request({ action: 'register', platform: 'web' }))).json();
  const base = { action: 'request', clientId: a.clientId };
  const missingRevision = await host.fetch(
    request({
      ...base,
      expiresAt: Date.now() + 5000,
      settings: { domain: 'layout', patch: {} },
    }),
  );
  expect(missingRevision.status).toBe(400);
  expect((await missingRevision.json()).error.code).toBe('appearance-revision-required');
  const noDeadline = await host.fetch(request({ ...base, settings: { domain: 'layout' } }));
  expect((await noDeadline.json()).error.code).toBe('appearance-request-stale');
  const both = await host.fetch(
    request({
      ...base,
      expiresAt: Date.now() + 5000,
      settings: { domain: 'layout' },
      hostLook: { hostId: 'h' },
    }),
  );
  expect(both.status).toBe(400);
  const stale = await host.fetch(
    request({
      action: 'request',
      clientId: 'gone',
      expiresAt: Date.now() + 5000,
      settings: { domain: 'preferences' },
    }),
  );
  expect(stale.status).toBe(404);
  expect((await stale.json()).error.code).toBe('appearance-client-stale');
  host.dispose();
});

it('sends reads without a revision and writes with the exact patch, revision and deadline', async () => {
  const http = vi.fn(async () => ({
    bytes: new TextEncoder().encode('{"revision":"r2"}'),
  }));
  const connect = async () => ({ http });
  const expiresAt = Date.now() + 5000;
  await expect(
    runClientSettings('client-layout-get', [], { 'client-id': 'c1' }, {}, connect, expiresAt),
  ).resolves.toEqual({ revision: 'r2' });
  expect(http).toHaveBeenLastCalledWith('/api/botharness/appearance-control', {
    action: 'request',
    clientId: 'c1',
    expiresAt,
    settings: { domain: 'layout' },
  });
  const patch = { locale: 'zh' };
  await runClientSettings(
    'client-preferences-set',
    [],
    { 'client-id': 'c1', 'patch-stdin': true, 'expected-revision': 'r2' },
    { readStdin: async () => JSON.stringify(patch) },
    connect,
    expiresAt,
  );
  expect(http).toHaveBeenLastCalledWith('/api/botharness/appearance-control', {
    action: 'request',
    clientId: 'c1',
    expiresAt,
    settings: { domain: 'preferences', patch },
    expectedRevision: 'r2',
  });
});

it('refuses ambiguous targets and flags with the patch shape, and reports a lost write as unknown', async () => {
  const connect = async () => ({
    http: async () => {
      throw new CliLiveError('appearance-client-timeout', 'timeout');
    },
  });
  const expiresAt = Date.now() + 5000;
  for (const [command, values] of [
    ['client-shortcuts-get', {}],
    ['client-shortcuts-get', { 'client-id': 'c1', 'patch-stdin': true }],
    ['client-shortcuts-set', { 'client-id': 'c1', 'patch-stdin': true }],
    ['client-shortcuts-set', { 'client-id': 'c1', 'expected-revision': 'r' }],
  ] as const)
    await expect(
      runClientSettings(command, [], values, {}, connect, expiresAt),
    ).rejects.toMatchObject({ code: 'usage' });
  await expect(
    runClientSettings('client-shortcuts-set', [], { 'client-id': 'c1' }, {}, connect, expiresAt),
  ).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringContaining('"reset":true'),
  });
  await expect(
    runClientSettings(
      'client-shortcuts-set',
      [],
      { 'client-id': 'c1', 'patch-stdin': true, 'expected-revision': 'r' },
      { readStdin: async () => '[]' },
      connect,
      expiresAt,
    ),
  ).rejects.toMatchObject({
    code: 'invalid-input',
    message: expect.stringContaining('"binding":{"code":"KeyJ"'),
  });
  await expect(
    runClientSettings(
      'client-shortcuts-set',
      [],
      { 'client-id': 'c1', 'patch-stdin': true, 'expected-revision': 'r' },
      { readStdin: async () => '{"action":"help","reset":true}' },
      connect,
      expiresAt,
    ),
  ).rejects.toMatchObject({ code: 'client-settings-outcome-unknown' });
  await expect(
    runClientSettings('client-shortcuts-get', [], { 'client-id': 'c1' }, {}, connect, expiresAt),
  ).rejects.toMatchObject({ code: 'appearance-client-timeout' });
  await expect(
    runClientSettings(
      'client-shortcuts-get',
      [],
      { 'client-id': 'c1' },
      {},
      connect,
      Date.now() - 1,
    ),
  ).rejects.toMatchObject({ code: 'appearance-request-stale' });
});

it('lets Tob read without a card and puts every write behind approval', () => {
  for (const domain of ['preferences', 'layout', 'shortcuts']) {
    expect(CLI_EFFECTS[`client-${domain}-get` as keyof typeof CLI_EFFECTS]).toMatchObject({
      brokerRead: true,
      effects: { changes: 'none' },
    });
    expect(CLI_EFFECTS[`client-${domain}-set` as keyof typeof CLI_EFFECTS]).toMatchObject({
      brokerRead: false,
      effects: { changes: 'reversible' },
    });
  }
});

it('tells a caller the patch shape before any write is attempted', () => {
  const described = Object.fromEntries(
    CLIENT_SETTINGS_COMMANDS.map(({ command, description }) => [command, description]),
  );
  expect(described['client-shortcuts-set']).toContain('{"action":"<id>","reset":true}');
  expect(described['client-preferences-set']).toContain('"locale":"<locale.available id>"');
  expect(described['client-preferences-set']).toContain(
    'appearance-set {"preference":"system|light|dark"}',
  );
  expect(described['client-layout-set']).toContain('"direction":"left|right|above|below"');
  expect(described['client-layout-set']).toContain('"move":{"panel","target","direction"}');
  expect(described['client-layout-set']).toContain('{"gap":0-16}');
});
