import { afterEach, describe, expect, it } from 'vitest';

import { setBotAvatar } from '../src/host/bot-avatar';
import { setBotBanner } from '../src/host/bot-banner';
import { createHostClient, type HostClient } from '@botharness/host-client/client';
import { fakeBotDetail, FakeHost } from '../../../packages/host-client/test/fake-host.js';

let client: HostClient | undefined;
afterEach(() => client?.stop());

async function setup() {
  const host = new FakeHost();
  const bot = fakeBotDetail('ada', 'Ada');
  const channels = [{ id: 'dm-ada', type: 'dm', name: 'Ada', members: ['ada'], botSlug: 'ada' }];
  host.methods.set('list', () => ({ bots: [bot] }));
  host.methods.set('channels', () => ({ channels }));
  host.methods.set('rosterGet', () => ({ sections: [], pins: [], hidden: [], sectionOrder: [] }));
  host.methods.set('botAvatarSet', () => ({ bot }));
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

  it('keeps an Avatar write exclusive to the Bot until the Host settles it', async () => {
    const { host, client } = await setup();
    const bot = { slug: 'ada', dmChannelId: 'dm-ada' };
    const pending = Promise.withResolvers<{ bot: ReturnType<typeof fakeBotDetail> }>();
    host.methods.set('botAvatarSet', () => pending.promise);
    const initial = setBotAvatar(client, bot, null);
    await expect(setBotAvatar(client, bot, null)).rejects.toThrow(
      'Avatar change already in progress',
    );
    pending.resolve({ bot: fakeBotDetail('ada', 'Ada') });
    await initial;
    await setBotAvatar(client, bot, null);
    expect(host.calls.filter((entry) => entry.method === 'botAvatarSet')).toHaveLength(2);
  });

  it('sets and restores the Profile Banner through the owning Bot DM', async () => {
    const { host, client } = await setup();
    const bot = { slug: 'ada', dmChannelId: 'dm-ada' };
    host.methods.set('botBannerSet', () => ({ bot: fakeBotDetail('ada', 'Ada') }));
    const image = 'data:image/png;base64,preview';
    await setBotBanner(client, bot, image);
    await setBotBanner(client, bot, null);
    expect(host.calls.filter((entry) => entry.method === 'botBannerSet')).toEqual([
      { method: 'botBannerSet', args: { channelId: 'dm-ada', banner: { image } } },
      { method: 'botBannerSet', args: { channelId: 'dm-ada', banner: null } },
    ]);
  });

  it('resolves a DM if the roster has no DM id yet', async () => {
    const { host, client } = await setup();
    const channel = { id: 'dm-ada', type: 'dm', name: 'Ada', members: ['ada'], botSlug: 'ada' };
    host.methods.set('channelDm', () => ({ channel }));
    await setBotAvatar(client, { slug: 'ada', displayName: 'Ada' }, null);
    expect(host.calls[0]).toEqual({
      method: 'channelDm',
      args: { slug: 'ada', displayName: 'Ada' },
    });
    expect(host.calls[1]).toEqual({
      method: 'botAvatarSet',
      args: { channelId: 'dm-ada', avatar: null },
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
