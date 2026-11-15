import { expect, it } from 'vitest';
import {
  loadMessagingSnapshot,
  loadChannelBridges,
  type BridgeCall,
} from '../src/client/bridge.js';

it('passes explicit settings modes and validates pending status metadata at the boundary', async () => {
  const calls: unknown[] = [];
  let checks: unknown = 'pending';
  const call: BridgeCall = async (method, args) => {
    calls.push({ method, args });
    return {
      ok: true,
      value:
        method === 'messagingSnapshot'
          ? { checks, accounts: [], identities: [], grants: [], intents: [] }
          : { checks, channelId: 'group', bridges: [], sources: [] },
    };
  };
  expect((await loadMessagingSnapshot(call, 'qa', 'saved')).checks).toBe('pending');
  expect((await loadChannelBridges(call, 'group', 'status')).checks).toBe('pending');
  expect(calls).toEqual([
    { method: 'messagingSnapshot', args: { slug: 'qa', mode: 'saved' } },
    { method: 'channelBridges', args: { channelId: 'group', mode: 'status' } },
  ]);
  checks = 'always-healthy';
  await expect(loadMessagingSnapshot(call, 'qa', 'saved')).rejects.toMatchObject({
    code: 'invalid-response',
  });
  await expect(loadChannelBridges(call, 'group', 'saved')).rejects.toMatchObject({
    code: 'invalid-response',
  });
});
