import { expect, it } from 'vitest';

import { BotModePrefs } from '../src/client/bot-mode-prefs.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { remoteBotModeScope } from '../src/client/remote-bot-mode-scope.js';

function fakeHost(refuseWrites = false) {
  let value: Record<string, unknown> = { autoAcceptGroupInvites: true, botHopLimit: 128 };
  let revision = 3;
  const calls: { endpoint: string; payload: Record<string, unknown> }[] = [];
  const call: BridgeCall = async (endpoint, payload) => {
    calls.push({ endpoint, payload });
    if (endpoint === 'settings/describe')
      return {
        ok: true,
        value: { namespaces: [{ ns: 'botharness-client', revision, value }] },
      } as never;
    if (endpoint === 'settings/update') {
      if (refuseWrites)
        return {
          ok: false,
          error: { code: 'secret-route-refused', message: 'no', details: {} },
        } as never;
      value = { ...value, ...(payload['patch'] as Record<string, unknown>) };
      revision += 1;
      return { ok: true, value: { ns: 'botharness-client', revision, value } } as never;
    }
    throw new Error(`unexpected ${endpoint}`);
  };
  return { call, calls, value: () => value };
}

it('reads and writes the Bot collaboration settings of a remote Host', async () => {
  const host = fakeHost();
  const scope = remoteBotModeScope(host.call);
  const prefs = new BotModePrefs();
  prefs.attach(scope);
  await scope.refresh();
  expect(prefs.source.getSnapshot()).toMatchObject({
    status: 'ready',
    mode: 'host',
    autoAcceptGroupInvites: true,
    botHopLimit: 128,
  });
  prefs.setAutoAcceptGroupInvites(false);
  await expect(prefs.setBotHopLimit(12)).resolves.toBe(true);
  await Promise.resolve();
  expect(host.value()).toMatchObject({ autoAcceptGroupInvites: false, botHopLimit: 12 });
  expect(host.calls.filter((entry) => entry.endpoint === 'settings/update')[0]?.payload).toEqual({
    ns: 'botharness-client',
    expectedRevision: 3,
    patch: { autoAcceptGroupInvites: false },
  });
  expect(prefs.source.getSnapshot()).toMatchObject({
    autoAcceptGroupInvites: false,
    botHopLimit: 12,
  });
});

it('keeps the remote value when the Host refuses a write', async () => {
  const host = fakeHost(true);
  const scope = remoteBotModeScope(host.call);
  const prefs = new BotModePrefs();
  prefs.attach(scope);
  await scope.refresh();
  await expect(prefs.setBotHopLimit(12)).resolves.toBe(false);
  expect(prefs.source.getSnapshot().botHopLimit).toBe(128);
});
