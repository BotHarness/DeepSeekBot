import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { RosterBot, RosterView } from '../../../apps/mobile/src/host/client.js';
import { RemoteAvatar } from '../src/client/remote-avatar.js';
import { bindTobPresentation } from '../src/client/tob-presentation.js';
import { zhTranslate } from '../src/client/locale.js';
import { resolvedAvatarRecipe } from '../../core/src/bots/primary-color.js';

const bot: RosterBot = {
  slug: 'tob',
  displayName: 'Remote Tob',
  roles: [],
  computerAccess: false,
  browserAccess: false,
  state: 'idle',
  paused: false,
  avatarSeed: 2,
  avatarUrl: 'https://studio.example.ts.net/botharness-device/api/botharness/avatar/tob',
};
const avatars = new Map([[bot.avatarUrl!, 'blob:remote-tob']]);
const roster: RosterView = {
  bots: [bot],
  channels: [{ id: 'crew', name: 'Crew', members: ['tob'], memberCount: 1 }],
};
const render = (
  target: { title: string; botSlug?: string; channelId?: string },
  feed = roster,
  images = avatars,
) =>
  renderToStaticMarkup(
    createElement(RemoteAvatar, {
      target,
      roster: feed,
      avatars: images,
      size: 34,
      t: zhTranslate,
    }),
  );

describe('RemoteAvatar', () => {
  it('uses authenticated object URLs and never looks up an identically named local Tob', () => {
    const local = vi.fn(() => undefined);
    const release = bindTobPresentation({
      bot: local,
      icon: () => 'bot',
      subscribe: () => () => {},
    });
    try {
      const portrait = render({ botSlug: 'tob', title: 'Remote Tob' });
      const group = render({ channelId: 'crew', title: 'Crew' });
      for (const markup of [portrait, group]) {
        expect(markup).toContain('src="blob:remote-tob"');
        expect(markup).toContain('Remote Tob');
        expect(markup).not.toContain(bot.avatarUrl);
      }
      expect(local).not.toHaveBeenCalled();
    } finally {
      release();
    }
  });

  it('uses the remote seed while an image is unavailable and for a removed author', () => {
    const pending = render({ botSlug: 'tob', title: 'Remote Tob' }, roster, new Map());
    expect(pending).toContain('data-media="seeded"');
    expect(pending).not.toContain(bot.avatarUrl);
    const missing = render({ botSlug: 'gone', title: 'Former Bot' });
    expect(missing).toContain('Former Bot');
    expect(missing).toContain('data-media="seeded"');
  });

  it('renders supported appearance and falls back for unknown appearance versions', () => {
    const appearance = { revision: 'a'.repeat(64), recipe: resolvedAvatarRecipe(bot) };
    const supported = render(
      { botSlug: 'tob', title: 'Remote Tob' },
      { ...roster, bots: [{ ...bot, appearance }] },
    );
    expect(supported).toContain('data-media="composed"');
    const unknown = render(
      { botSlug: 'tob', title: 'Remote Tob' },
      { ...roster, bots: [{ ...bot, appearance: { version: 999 } }] },
    );
    expect(unknown).toContain('src="blob:remote-tob"');
  });

  it('uses the group data URL ahead of member faces and keeps empty groups as hash tiles', () => {
    const image = 'data:image/png;base64,avatar';
    const custom = render(
      { channelId: 'crew', title: 'Crew' },
      { ...roster, channels: [{ ...roster.channels[0]!, avatar: image }] },
    );
    expect(custom).toContain(`src="${image}"`);
    expect(custom).not.toContain('bh-group-avatar-stack');
    const empty = render(
      { channelId: 'crew', title: 'Crew' },
      { ...roster, channels: [{ ...roster.channels[0]!, members: [] }] },
    );
    expect(empty).toContain('<svg');
    expect(empty).not.toContain('bh-group-avatar-stack');
  });

  it('keeps equal slugs from separate Hosts on their own image', () => {
    const other = {
      ...bot,
      avatarUrl: 'https://other.example.ts.net/botharness-device/api/botharness/avatar/tob',
    };
    const images = new Map([...avatars, [other.avatarUrl, 'blob:other-tob']]);
    expect(render({ botSlug: 'tob', title: 'Remote Tob' }, roster, images)).toContain(
      'src="blob:remote-tob"',
    );
    expect(
      render({ botSlug: 'tob', title: 'Remote Tob' }, { ...roster, bots: [other] }, images),
    ).toContain('src="blob:other-tob"');
  });
});
