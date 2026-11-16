import { expect, it, vi } from 'vitest';

import { createHostClient } from '../../../apps/mobile/src/host/client.js';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import { remoteHostActions } from '../src/client/remote-host-actions.js';

it('reads and writes prompt and voice settings on the remote Host it was made for', async () => {
  const host = new FakeHost('studio');
  const seen: [string, Record<string, unknown>][] = [];
  for (const method of ['promptPresets', 'promptGlobalSet', 'voiceProviders'])
    host.methods.set(method, (args) => {
      seen.push([method, args]);
      return method === 'promptGlobalSet'
        ? { presetId: args['presetId'] }
        : method === 'promptPresets'
          ? { presets: [], globalPresetId: null }
          : { providers: [] };
    });
  const client = createHostClient({
    routes: ['https://studio.test.ts.net'],
    credential: host.credential,
    carrier: host.carrier,
  });
  client.start();
  try {
    await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('connected'));
    const actions = remoteHostActions(client);
    expect(remoteHostActions(client)).toBe(actions);
    await actions.promptPresets?.();
    await expect(actions.promptGlobalSet?.('concise')).resolves.toEqual({ presetId: 'concise' });
    await actions.voiceProviders?.().catch(() => undefined);
    expect(seen.map(([method]) => method)).toEqual([
      'promptPresets',
      'promptGlobalSet',
      'voiceProviders',
    ]);
    expect(seen[1]?.[1]).toEqual({ presetId: 'concise' });
  } finally {
    client.stop();
  }
});
