import { describe, expect, it } from 'vitest';

import { loadBotProfile } from '../src/host/bot-profile';
import { createHostClient } from '../src/host/client';
import type { MemoryFile, MemorySnapshot } from '../src/host/wire';
import { pairWithLiveHost } from './live-pairing';
import { nodeCarrier } from './node-carrier';

const live = process.env['MOBILE_LIVE_HOST_URL'];
const PERSONA = 'You are Profile Probe.\n\nStanding rules:\n- Answer in short paragraphs.';

describe.skipIf(live === undefined)('Bot profile against a live isolated Host', () => {
  it('reads the same persona and Memory files as the Web Client', async () => {
    const { route, operator, host } = await pairWithLiveHost(live!, 'mobile profile live test');
    const web = async <T>(method: string, args: Record<string, unknown>): Promise<T> => {
      const response = await operator.request(`${route}/api/botharness/${method}`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: `botharness/${method}`,
          payload: { args },
        }),
      });
      return (JSON.parse(await response.text()) as { result: { value: T } }).result.value;
    };
    const client = createHostClient({
      routes: host.routes,
      credential: host.credential,
      carrier: nodeCarrier(),
    });
    const created = await client.call<{ bot: { slug: string } }>('create', {
      displayName: 'Profile Probe',
      persona: PERSONA,
      roles: ['tester'],
    });
    const slug = created.bot.slug;

    const profile = await loadBotProfile(client, { slug, displayName: 'Profile Probe' });

    const channelId = `dm-${slug}`;
    const snapshot = await web<{ snapshot: MemorySnapshot }>('memorySnapshot', { channelId });
    const soul = await web<{ file?: MemoryFile }>('memoryFile', { channelId, path: 'SOUL.md' });
    expect(soul.file?.body.trim()).toContain('Standing rules:');
    expect(profile.identity).toEqual({ status: 'ready', value: soul.file?.body.trim() });
    expect(profile.memory).toEqual({ status: 'ready', value: { files: snapshot.snapshot.files } });
    expect(profile.routines).toEqual({ status: 'ready', value: [] });
    expect(profile.files).toEqual({ status: 'ready', value: [] });
  }, 60_000);
});
