import { describe, expect, it } from 'vitest';
import { MAX_DESCRIPTOR_BYTES, parseBotDescriptor } from '../../core/src/marketplace/descriptor.js';
import { createMarket, fakeRepository, submit } from './market-harness.js';

describe('bot.json descriptor', () => {
  it('keeps a valid name, tags, bio and avatar, reading legacy roles as tags', () => {
    expect(
      parseBotDescriptor(
        JSON.stringify({
          name: '  Pixel Painter ',
          tags: ['artist', ' reviewer ', 'artist'],
          bio: '  Paints pixel avatars. ',
          avatar: { image: './assets/avatar.png' },
          extra: 'ignored',
        }),
      ),
    ).toEqual({
      name: 'Pixel Painter',
      tags: ['artist', 'reviewer'],
      bio: 'Paints pixel avatars.',
      avatar: { image: 'assets/avatar.png' },
    });
    expect(parseBotDescriptor('{"roles":["legacy"]}')).toEqual({ tags: ['legacy'] });
    expect(parseBotDescriptor('{"tags":["new"],"roles":["legacy"]}')).toEqual({ tags: ['new'] });
    expect(parseBotDescriptor('{"avatar":{"recipe":{"family":"illustrated"}}}')).toEqual({
      avatar: { recipe: { family: 'illustrated' } },
    });
    expect(parseBotDescriptor('{}')).toEqual({});
  });

  it.each([
    ['not JSON', '{name:'],
    ['an array', '[]'],
    ['a numeric name', '{"name":3}'],
    ['an empty name', '{"name":"  "}'],
    ['a long name', JSON.stringify({ name: 'x'.repeat(61) })],
    ['too many roles', JSON.stringify({ roles: Array.from({ length: 9 }, (_, i) => `r${i}`) })],
    ['a non-string role', '{"roles":["ok",1]}'],
    ['too many tags', JSON.stringify({ tags: Array.from({ length: 9 }, (_, i) => `t${i}`) })],
    ['a long tag', JSON.stringify({ tags: ['x'.repeat(33)] })],
    ['a numeric bio', '{"bio":3}'],
    ['a long bio', JSON.stringify({ bio: 'x'.repeat(161) })],
    ['a path traversal', '{"avatar":{"image":"../secret.png"}}'],
    ['an absolute path', '{"avatar":{"image":"/etc/avatar.png"}}'],
    ['a URL', '{"avatar":{"image":"https://evil.example/a.png"}}'],
    ['a non-image file', '{"avatar":{"image":"avatar.svg"}}'],
    ['both recipe and image', '{"avatar":{"recipe":{},"image":"a.png"}}'],
    ['an oversized file', JSON.stringify({ name: 'a', pad: 'x'.repeat(MAX_DESCRIPTOR_BYTES) })],
  ])('rejects %s', (_, text) => {
    expect(parseBotDescriptor(text)).toBeUndefined();
  });
});

describe('Marketplace Worker presentation', () => {
  it('lists the descriptor name, tags and bio', async () => {
    const market = createMarket();
    const repository = fakeRepository({
      descriptor: JSON.stringify({ name: 'Helper', tags: ['writer', 'editor'], bio: 'Writes.' }),
    });
    market.publish(repository);

    const response = await submit(market, repository.htmlUrl);

    expect(await response.json()).toMatchObject({
      bot: {
        name: 'helper-bot',
        displayName: 'Helper',
        tags: ['writer', 'editor'],
        roles: ['writer', 'editor'],
        bio: 'Writes.',
        description: 'A helpful bot',
      },
    });
  });

  it('serves a banner recipe as is and an uploaded banner as a raw URL at the indexed commit', async () => {
    const market = createMarket();
    const scene = fakeRepository({
      name: 'scene',
      descriptor: JSON.stringify({ banner: { recipe: { scene: 'sea', seed: 7 } } }),
    });
    const upload = fakeRepository({
      name: 'upload',
      descriptor: JSON.stringify({ banner: { image: '.botharness/banner.png' } }),
    });
    const none = fakeRepository({ name: 'none' });
    for (const repository of [scene, upload, none]) market.publish(repository);

    const banners = [];
    for (const repository of [scene, upload, none]) {
      const body = (await (await submit(market, repository.htmlUrl)).json()) as {
        bot: { banner: unknown; headCommit: { sha: string } | null };
      };
      banners.push(body.bot);
    }
    expect(banners[0]?.banner).toEqual({ recipe: { scene: 'sea', seed: 7 } });
    expect(banners[1]?.banner).toEqual({
      image: `https://raw.githubusercontent.com/${upload.owner}/upload/${banners[1]?.headCommit?.sha}/.botharness/banner.png`,
    });
    expect(banners[2]?.banner).toBeNull();
  });

  it('serves an avatar recipe as is and an avatar image as a raw URL at the indexed commit', async () => {
    const market = createMarket();
    const recipe = { family: 'illustrated', species: 'cat' };
    const drawn = fakeRepository({
      name: 'drawn',
      descriptor: JSON.stringify({ avatar: { recipe } }),
    });
    const photo = fakeRepository({
      name: 'photo',
      descriptor: JSON.stringify({ avatar: { image: '.botharness/avatar.png' } }),
    });
    const none = fakeRepository({ name: 'none' });
    for (const repository of [drawn, photo, none]) market.publish(repository);

    const bots = [];
    for (const repository of [drawn, photo, none]) {
      const body = (await (await submit(market, repository.htmlUrl)).json()) as {
        bot: { avatar: unknown; headCommit: { sha: string } | null };
      };
      bots.push(body.bot);
    }
    expect(bots[0]?.avatar).toEqual({ recipe });
    expect(bots[1]?.avatar).toEqual({
      image: `https://raw.githubusercontent.com/${photo.owner}/photo/${bots[1]?.headCommit?.sha}/.botharness/avatar.png`,
    });
    expect(bots[2]?.avatar).toBeNull();
  });

  it('falls back to legacy roles and the GitHub description', async () => {
    const market = createMarket();
    const repository = fakeRepository({
      descriptor: JSON.stringify({ name: 'Helper', roles: ['writer'] }),
    });
    market.publish(repository);

    const response = await submit(market, repository.htmlUrl);

    expect(await response.json()).toMatchObject({
      bot: { tags: ['writer'], roles: ['writer'], bio: 'A helpful bot' },
    });
  });

  it('keeps defaults and the entry when the descriptor is missing or invalid', async () => {
    const market = createMarket();
    const missing = fakeRepository({ name: 'missing' });
    const invalid = fakeRepository({ name: 'invalid', descriptor: '{"name": 42}' });
    market.publish(missing);
    market.publish(invalid);

    for (const repository of [missing, invalid]) {
      const response = await submit(market, repository.htmlUrl);
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ bot: { displayName: null, roles: [] } });
    }
  });

  it('refetches the descriptor only after a push', async () => {
    const market = createMarket();
    const repository = fakeRepository({ descriptor: '{"name":"First"}' });
    market.publish(repository);
    await submit(market, repository.htmlUrl);

    market.publish({ ...repository, descriptor: '{"name":"Second"}' });
    await market.scheduled('17 * * * *');
    const unchanged = (await (await market.request('/v1/bots')).json()) as {
      bots: { displayName: string }[];
    };
    expect(unchanged.bots[0]?.displayName).toBe('First');

    market.publish({
      ...repository,
      descriptor: '{"name":"Second"}',
      pushedAt: '2026-10-02T00:00:00Z',
    });
    await market.scheduled('17 * * * *');
    const changed = (await (await market.request('/v1/bots')).json()) as {
      bots: { displayName: string }[];
    };
    expect(changed.bots[0]?.displayName).toBe('Second');
  });

  it('keeps the last good presentation when the descriptor fetch fails', async () => {
    const market = createMarket();
    const repository = fakeRepository({ descriptor: '{"name":"Kept"}' });
    market.publish(repository);
    await submit(market, repository.htmlUrl);

    market.publish({
      ...repository,
      pushedAt: '2026-10-02T00:00:00Z',
      descriptor: '{"name":"New"}',
    });
    market.github.contentsDown.value = true;
    await market.scheduled('17 * * * *');
    market.github.contentsDown.value = false;

    expect(market.github.requests).toContain(
      '/repos/alice/helper-bot/contents/.botharness/bot.json',
    );
    const page = (await (await market.request('/v1/bots')).json()) as {
      bots: { displayName: string }[];
    };
    expect(page.bots[0]?.displayName).toBe('Kept');
  });
});
