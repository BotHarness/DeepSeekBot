import { describe, expect, it } from 'vitest';
import { MAX_MARKETPLACE_AVATAR_BYTES } from '../../host-protocol/src/marketplace-avatar.js';
import { MAX_BOTS_PER_ACCOUNT } from '../src/upload-files.js';
import { avatarDataUrl, avatarFixtures } from './avatar-fixtures.js';
import { admin, createMarket, fakeRepository, post, solve, submit } from './market-harness.js';

type Market = ReturnType<typeof createMarket>;
const png = Buffer.from(avatarFixtures.png, 'base64');
const jpeg = Buffer.from(avatarFixtures.jpeg, 'base64');
const webp = Buffer.from(avatarFixtures.webp, 'base64');
const input = {
  name: 'Otter',
  description: '',
  tags: [],
  image: avatarDataUrl('png'),
  requestKey: 'otter',
  confirm: true,
};

function write(market: Market, path: string, body: unknown, token?: string, method = 'POST') {
  return market.request(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

async function author(market: Market, token = 'token-alice') {
  const response = await write(
    market,
    '/v1/me',
    { displayName: 'Alice', acceptTerms: true },
    token,
    'PUT',
  );
  expect(response.status).toBe(200);
  return (await response.json()).author;
}

function publish(market: Market, overrides: Record<string, unknown> = {}, token = 'token-alice') {
  return write(market, '/v1/avatars', { ...input, ...overrides }, token);
}

function url(type: string, bytes: Buffer) {
  return `data:image/${type};base64,${bytes.toString('base64')}`;
}

function pngSize(width: number, height: number) {
  const image = Buffer.from(png);
  image.writeUInt32BE(width, 16);
  image.writeUInt32BE(height, 20);
  return image;
}

function pngChunk(type: string) {
  const chunk = Buffer.alloc(12);
  chunk.write(type, 4);
  return Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
}

function webpChunk(type: string) {
  const chunk = Buffer.alloc(8);
  chunk.write(type);
  const result = Buffer.concat([webp, chunk]);
  result.writeUInt32LE(result.length - 8, 4);
  return result;
}

async function empty(market: Market) {
  expect((await (await market.request('/v1/avatars')).json()).avatars).toEqual([]);
  expect(market.bucket.objects.size).toBe(0);
  expect(market.sqlite.prepare('SELECT COUNT(*) AS count FROM marketplace_avatars').get()).toEqual({
    count: 0,
  });
}

describe('Marketplace Avatars HTTP', () => {
  it.each(['png', 'jpeg', 'webp'] as const)(
    'publishes processed %s bytes and serves public detail and image',
    async (type) => {
      const market = createMarket();
      const profile = await author(market);
      const created = await publish(market, {
        image: avatarDataUrl(type),
        name: ' Otter ',
        description: ' A swimmer ',
        tags: [' Water ', 'water', 'River'],
      });
      expect(created.status).toBe(201);
      expect(created.headers.get('cache-control')).toBe('no-store');
      const { avatar } = await created.json();
      expect(avatar).toEqual({
        id: expect.any(String),
        imageUrl: `https://market.test/v1/avatars/${avatar.id}/image`,
        name: 'Otter',
        description: 'A swimmer',
        tags: ['Water', 'River'],
        author: { name: 'Alice', id: profile.id },
        applyCount: 0,
      });
      const detail = await market.request(`/v1/avatars/${avatar.id}`);
      expect(detail.status).toBe(200);
      expect(await detail.json()).toEqual({ avatar });
      const image = await market.request(`/v1/avatars/${avatar.id}/image`);
      expect(image.headers.get('content-type')).toBe(`image/${type}`);
      expect(image.headers.get('x-content-type-options')).toBe('nosniff');
      expect(Buffer.from(await image.arrayBuffer())).toEqual(
        Buffer.from(avatarFixtures[type], 'base64'),
      );
      const list = await market.request('/v1/avatars');
      expect(list.headers.get('cache-control')).toBe('no-cache');
      expect(await list.json()).toEqual({
        avatars: [avatar],
        nextCursor: null,
      });
    },
  );

  it.each([
    ['wrong signature', url('png', Buffer.from('<svg/>'))],
    ['disguised file', url('png', png.subarray(0, 33))],
    ['wrong declared format', url('jpeg', png)],
    ['trailing payload', url('png', Buffer.concat([png, Buffer.from('<svg/>')]))],
    ['invalid base64', 'data:image/png;base64,a=='],
    ['non-square', url('png', pngSize(256, 300))],
    ['too small', url('png', pngSize(255, 255))],
    ['too large', url('png', pngSize(513, 513))],
    ['APNG animation', url('png', pngChunk('acTL'))],
    ['WebP animation', url('webp', webpChunk('ANIM'))],
    [
      'JPEG APP1',
      url(
        'jpeg',
        Buffer.concat([
          jpeg.subarray(0, 2),
          Buffer.from([0xff, 0xe1, 0, 4, 0, 0]),
          jpeg.subarray(2),
        ]),
      ),
    ],
    ...['eXIf', 'tEXt', 'iTXt', 'zTXt'].map((type) => [type, url('png', pngChunk(type))]),
    ...['EXIF', 'XMP '].map((type) => [type, url('webp', webpChunk(type))]),
    [
      'over 128 KiB',
      url('png', Buffer.concat([png, Buffer.alloc(MAX_MARKETPLACE_AVATAR_BYTES + 1 - png.length)])),
    ],
    ['oversized request body', url('png', Buffer.alloc(2 * MAX_MARKETPLACE_AVATAR_BYTES))],
  ])('refuses %s without writing D1 or R2', async (_reason, image) => {
    const market = createMarket();
    await author(market);
    const response = await publish(market, { image });
    expect([413, 415]).toContain(response.status);
    expect(await response.json()).toEqual({ error: { code: 'unprocessed-image' } });
    await empty(market);
  });

  it.each([
    { name: '   ' },
    { name: '💡'.repeat(41) },
    { description: '字'.repeat(161) },
    { tags: ['a', 'b', 'c', 'd', 'e', 'f'] },
    { tags: ['z'.repeat(25)] },
    { tags: [42] },
    { confirm: false },
    { requestKey: '' },
  ])('refuses invalid publish fields %j', async (overrides) => {
    const market = createMarket();
    await author(market);
    const response = await publish(market, overrides);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: 'invalid-avatar-publish' } });
    await empty(market);
  });

  it('requires an authenticated author who accepted upload terms', async () => {
    const market = createMarket();
    expect((await write(market, '/v1/avatars', input)).status).toBe(401);
    expect((await publish(market)).status).toBe(409);
    const profile = await author(market);
    expect(
      await (
        await publish(market, { expectedAuthorId: profile.id === 'zzzzzz' ? '222222' : 'zzzzzz' })
      ).json(),
    ).toEqual({ error: { code: 'author-changed' } });
    await empty(market);
    expect(
      (
        await publish(market, {
          expectedAuthorId: profile.id,
          name: '💡'.repeat(40),
          description: '字'.repeat(160),
          tags: ['z'.repeat(24), 'b', 'c', 'd', 'e'],
        })
      ).status,
    ).toBe(201);
  });

  it('keeps one listing and object on a concurrent retry, enforces the account cap and paginates without duplicates', async () => {
    const market = createMarket();
    await author(market);
    await author(market, 'token-bob');
    const attempts = await Promise.all([publish(market), publish(market)]);
    expect(attempts.map((response) => response.status).sort()).toEqual([200, 201]);
    const bodies = await Promise.all(attempts.map((response) => response.json()));
    expect(bodies[0]).toEqual(bodies[1]);
    expect(market.bucket.objects.size).toBe(1);
    for (let index = 1; index < MAX_BOTS_PER_ACCOUNT; index++) {
      expect((await publish(market, { requestKey: `a-${index}` })).status).toBe(201);
    }
    const capped = await publish(market, { requestKey: 'one-too-many' });
    expect(capped.status).toBe(409);
    expect(await capped.json()).toEqual({ error: { code: 'avatar-limit' } });
    expect((await publish(market)).status).toBe(200);
    expect(market.bucket.objects.size).toBe(MAX_BOTS_PER_ACCOUNT);
    for (let index = 0; index < 7; index++) {
      expect(
        (
          await publish(
            market,
            { requestKey: index === 0 ? input.requestKey : `b-${index}` },
            'token-bob',
          )
        ).status,
      ).toBe(201);
    }

    const first = await (await market.request('/v1/avatars')).json();
    expect(first.avatars).toHaveLength(24);
    const second = await (
      await market.request(`/v1/avatars?cursor=${encodeURIComponent(first.nextCursor)}`)
    ).json();
    expect(second.avatars).toHaveLength(3);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.avatars, ...second.avatars].map(({ id }) => id)).size).toBe(27);
    expect((await market.request('/v1/avatars?cursor=garbage')).status).toBe(400);
  });

  it('keeps the Bots browse response and upstream requests unchanged when Avatars are published and browsed', async () => {
    const market = createMarket();
    const repo = fakeRepository();
    market.publish(repo);
    expect((await submit(market, repo.htmlUrl)).ok).toBe(true);
    const before = await (await market.request('/v1/bots')).json();
    const upstream = [...market.github.requests];
    await author(market);
    expect((await publish(market)).status).toBe(201);
    expect((await market.request('/v1/avatars')).status).toBe(200);
    const after = await (await market.request('/v1/bots')).json();
    expect(after).toEqual(before);
    expect(market.github.requests).toEqual(upstream);
  });
});

it('records distinct Bot receipts on listed Avatars and projects the count in list and detail', async () => {
  const market = createMarket();
  await author(market);
  const { avatar } = await (await publish(market)).json();
  const { avatar: second } = await (await publish(market, { requestKey: 'second' })).json();
  const botHash = 'a'.repeat(64);
  const path = `/v1/avatars/${avatar.id}`;
  expect((await write(market, `${path}/applies`, { botHash: 'raw-bot' })).status).toBe(400);
  const replies = await Promise.all([
    write(market, `${path}/applies`, { botHash }),
    write(market, `${path}/applies`, { botHash }),
  ]);
  expect(replies.map((reply) => reply.status)).toEqual([202, 202]);
  const receipts = await Promise.all(replies.map((reply) => reply.json()));
  expect(receipts).toEqual(
    expect.arrayContaining([
      { counted: true, applyCount: 1 },
      { counted: false, applyCount: 1 },
    ]),
  );
  expect(
    await (await write(market, `${path}/applies`, { botHash: 'b'.repeat(64) })).json(),
  ).toEqual({
    counted: true,
    applyCount: 2,
  });
  expect(await (await market.request(path)).json()).toMatchObject({ avatar: { applyCount: 2 } });
  expect(await (await market.request('/v1/avatars')).json()).toMatchObject({
    avatars: expect.arrayContaining([
      { ...avatar, applyCount: 2 },
      { ...second, applyCount: 0 },
    ]),
  });
  market.sqlite
    .prepare("UPDATE marketplace_avatars SET visibility = 'hidden_reported' WHERE id = ?")
    .run(avatar.id);
  expect((await write(market, `${path}/applies`, { botHash: 'c'.repeat(64) })).status).toBe(404);
  expect((await market.request(`${path}/image`)).status).toBe(404);
  market.sqlite.prepare('DELETE FROM marketplace_avatars WHERE id = ?').run(avatar.id);
  expect((await write(market, `${path}/applies`, { botHash })).status).toBe(404);
});

it('rate limits Avatar apply receipts by source', async () => {
  const market = createMarket({ limits: { installPerHour: 1 } });
  await author(market);
  const { avatar } = await (await publish(market)).json();
  const path = `/v1/avatars/${avatar.id}/applies`;
  expect((await write(market, path, { botHash: 'a'.repeat(64) })).status).toBe(202);
  const limited = await write(market, path, { botHash: 'b'.repeat(64) });
  expect(limited.status).toBe(429);
  expect(limited.headers.get('retry-after')).toBe('3600');
});

it('shares the report challenge and threshold, hides all public reads and restores without losing applies', async () => {
  const market = createMarket();
  await author(market);
  const { avatar } = await (await publish(market)).json();
  const { avatar: other } = await (await publish(market, { requestKey: 'other' })).json();
  const id = avatar.id;
  const path = `/v1/avatars/${id}`;
  const from = async (source: number) => {
    const ip = `203.0.113.${source}`;
    return post(market, `${path}/reports`, { altcha: await solve(market, ip), reason: 'spam' }, ip);
  };
  const list = async () => (await (await market.request('/v1/avatars')).json()).avatars;
  const hidden = async () => {
    expect(await list()).toEqual([other]);
    expect((await market.request(path)).status).toBe(404);
    expect((await market.request(`${path}/image`)).status).toBe(404);
    expect((await write(market, `${path}/applies`, { botHash: 'b'.repeat(64) })).status).toBe(404);
  };

  expect((await write(market, `${path}/applies`, { botHash: 'a'.repeat(64) })).status).toBe(202);
  expect((await post(market, `${path}/reports`, { altcha: 'invalid' })).status).toBe(400);
  for (const source of [1, 1, 2]) {
    expect(await (await from(source)).json()).toEqual({ received: true });
  }
  expect((await market.request(path)).status).toBe(200);
  expect((await from(3)).status).toBe(202);
  await hidden();
  expect((await from(4)).status).toBe(404);

  const action = (action: string) => ({ kind: 'avatar', id, action });
  expect((await admin(market, action('restore'), 'wrong-token')).status).toBe(401);
  expect((await admin(market, { action: 'restore', id })).status).toBe(404);
  const restore = async () => {
    expect(await (await admin(market, action('restore'))).json()).toEqual({
      avatar: { id, name: avatar.name, visibility: 'listed' },
    });
    expect(await list()).toEqual(expect.arrayContaining([{ ...avatar, applyCount: 1 }, other]));
    expect((await market.request(`${path}/image`)).status).toBe(200);
  };

  await restore();
  expect((await from(1)).status).toBe(202);
  expect((await market.request(path)).status).toBe(200);
  expect(await (await admin(market, action('block'))).json()).toEqual({
    avatar: { id, name: avatar.name, visibility: 'blocked' },
  });
  await hidden();
  await restore();
  for (const source of [2, 3]) expect((await from(source)).status).toBe(202);
  expect((await market.request(path)).status).toBe(200);
  expect((await from(4)).status).toBe(202);
  await hidden();
});
