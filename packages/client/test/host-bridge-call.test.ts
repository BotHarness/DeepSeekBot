import { expect, it, vi } from 'vitest';
import { createHostClient, deviceRefusal } from '../../../apps/mobile/src/host/client.js';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import { BridgeCallError } from '../src/client/bridge.js';
import { hostBridgeCall } from '../src/client/host-bridge-call.js';

it('retains native coded refusal details from the target Host', async () => {
  const host = new FakeHost();
  host.answers.set('preview', () => ({
    ok: false,
    error: {
      code: 'all-bot-preview-changed',
      message: 'Review the new recipients.',
      details: { preview: { revision: 'new', recipients: [] } },
    },
  }));
  const client = createHostClient({
    routes: ['https://target.test.ts.net'],
    credential: host.credential,
    carrier: host.carrier,
  });
  client.start();
  try {
    await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('connected'));
    const call = hostBridgeCall(client, () => true);
    await expect(call('preview', {})).rejects.toBeInstanceOf(BridgeCallError);
    await expect(call('preview', {})).rejects.toMatchObject({
      code: 'all-bot-preview-changed',
      details: { preview: { revision: 'new' } },
    });
    host.revoke();
    const refused = await call('ping', {}).catch((error: unknown) => error);
    expect(deviceRefusal(refused)).toBe('device-revoked');
    expect(refused).not.toBeInstanceOf(BridgeCallError);
  } finally {
    client.stop();
  }
});

it('preserves transport failures and fences a late response after the destination changes', async () => {
  const host = new FakeHost();
  const client = createHostClient({
    routes: ['https://target.test.ts.net'],
    credential: host.credential,
    carrier: host.carrier,
  });
  let current = true;
  const call = hostBridgeCall(client, () => current);
  const transport = Object.assign(new Error('Carrier lost'), { code: 'some-network-code' });
  const stub = vi.spyOn(client, 'call').mockRejectedValue(transport);
  await expect(call('ping', {})).rejects.toBe(transport);
  stub.mockImplementation(async () => {
    current = false;
    return {};
  });
  await expect(call('ping', {})).rejects.toThrow('remote-conversation-unavailable');
  stub.mockRestore();
});
