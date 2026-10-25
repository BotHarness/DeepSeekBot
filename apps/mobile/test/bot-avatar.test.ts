import { afterEach, describe, expect, it } from 'vitest';

import { setBotAvatar } from '../src/host/bot-avatar';
import { createHostClient, type HostClient } from '../src/host/client';
import { FakeHost } from './fake-host';

let client: HostClient | undefined;
afterEach(() => client?.stop());

async function setup() {
  const host = new FakeHost();
  host.methods.set('list', () => ({ bots: [] }));
  host.methods.set('channels', () => ({ channels: [] }));
  host.methods.set('rosterGet', () => ({ sections: [], pins: [], hidden: [], sectionOrder: [] }));
  host.methods.set('botAvatarSet', () => ({}));
  client = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: host.credential,
    carrier: host.carrier,
  });
  client.start();
  await new Promise<void>((resolve) => {
    const unsubscribe = client!.subscribe(() => {
      if (client!.getSnapshot().roster !== undefined) {
        unsubscribe();
        resolve();
      }
    });
  });
  host.calls.length = 0;
  return { host, client };
}

describe('mobile Bot avatars', () => {
  it('saves and removes the Bot avatar through its DM and refreshes shared roster data', async () => {
    const { host, client } = await setup();
    const bot = { slug: 'ada', dmChannelId: 'dm-ada' };
    const avatar = 'data:image/jpeg;base64,/9j/AA==';
    await setBotAvatar(client, bot, avatar);
    await setBotAvatar(client, bot, null);
    expect(host.calls.filter((call) => call.method === 'botAvatarSet')).toEqual([
      { method: 'botAvatarSet', args: { channelId: 'dm-ada', avatar } },
      { method: 'botAvatarSet', args: { channelId: 'dm-ada', avatar: null } },
    ]);
    expect(host.calls.filter((call) => call.method === 'list')).toHaveLength(2);
    expect(host.calls.filter((call) => call.method === 'channelGroupAvatarSet')).toHaveLength(0);
  });

  it('resolves a DM if the roster has no DM id yet', async () => {
    const { host, client } = await setup();
    host.methods.set('channelDm', () => ({ channel: { id: 'dm-created' } }));
    await setBotAvatar(client, { slug: 'ada', displayName: 'Ada' }, null);
    expect(host.calls[0]).toEqual({
      method: 'channelDm',
      args: { slug: 'ada', displayName: 'Ada' },
    });
    expect(host.calls[1]).toEqual({
      method: 'botAvatarSet',
      args: { channelId: 'dm-created', avatar: null },
    });
  });

  it('preserves a Host refusal without writing any other setting', async () => {
    const { host, client } = await setup();
    host.methods.set('botAvatarSet', () => {
      throw new Error('avatar refused');
    });
    await expect(
      setBotAvatar(client, { slug: 'ada', dmChannelId: 'dm-ada' }, null),
    ).rejects.toThrow('avatar refused');
    expect(host.calls).toHaveLength(1);
  });
});
