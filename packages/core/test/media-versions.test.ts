import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { afterEach, expect, it } from 'vitest';

import { createAttachmentHttp } from '../src/attachments/http.js';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';

const cores: ReturnType<typeof createCore>[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

const png = (width: number, height: number, r = 200) =>
  sharp({ create: { width, height, channels: 3, background: { r, g: 80, b: 40 } } })
    .png()
    .toBuffer();

async function fixture() {
  const core = createCore({ dshHome: createTempRoot('bh-media-versions-') });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
  const bytes = await png(1200, 800);
  const ref = await core.attachments.upload({
    name: 'photo.png',
    data: (async function* () {
      yield bytes;
    })(),
  });
  await core.channels.appendMessage(dm.id, {
    id: 'photo',
    at: new Date().toISOString(),
    author: { kind: 'bot', slug: 'ada' },
    body: 'Here',
    attachments: [ref],
  });
  const handle = createAttachmentHttp(
    core.attachments,
    core.channels,
    undefined,
    undefined,
    core.mediaVersions,
  );
  const get = (query: string, headers: Record<string, string> = {}) =>
    handle(
      new Request(
        `http://host/api/botharness/attachment?channelId=${dm.id}&messageId=photo&fileId=${ref.fileId}${query}`,
        { headers },
      ),
    );
  const attachment = () => core.channels.message(dm.id, 'photo')!.attachments![0]!;
  return { core, dm, ref, get, attachment };
}

it('describes an image with a content version, dimensions and a thumbhash', async () => {
  const { core, ref, attachment } = await fixture();
  await core.mediaVersions.ensure(ref.fileId!);
  expect(attachment()).toMatchObject({ fileId: ref.fileId, width: 1200, height: 800 });
  expect(attachment().version).toMatch(/^[0-9a-f]{32}$/u);
  expect(attachment().thumbhash).toBeTruthy();
});

it('serves a versioned thumbnail as immutable WebP and revalidates by ETag', async () => {
  const { core, ref, get } = await fixture();
  const version = (await core.mediaVersions.ensure(ref.fileId!))!.version;
  const response = await get(`&v=${version}&variant=320`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/webp');
  expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
  const etag = response.headers.get('etag')!;
  expect(await sharp(Buffer.from(await response.arrayBuffer())).metadata()).toMatchObject({
    format: 'webp',
    width: 320,
  });
  expect((await get(`&v=${version}&variant=320`, { 'if-none-match': etag })).status).toBe(304);
  const original = await get(`&v=${version}`);
  expect(original.headers.get('content-type')).toBe('image/png');
  expect(original.headers.get('cache-control')).toContain('immutable');
  expect((await get(`&v=${version}&variant=2048`)).status).toBe(400);
});

it('gives an edited original a new version and refuses the old one with the current version', async () => {
  const { core, ref, get, attachment } = await fixture();
  const before = (await core.mediaVersions.ensure(ref.fileId!))!.version;
  expect((await get(`&v=${before}&variant=320`)).status).toBe(200);
  writeFileSync(core.attachments.fileTarget(ref.fileId!).path, await png(600, 900, 20));
  const after = (await core.mediaVersions.ensure(ref.fileId!))!.version;
  expect(after).not.toBe(before);
  expect(attachment()).toMatchObject({ version: after, width: 600, height: 900 });
  const refused = await get(`&v=${before}&variant=320`);
  expect(refused.status).toBe(409);
  expect(refused.headers.get('cache-control')).toBe('no-store');
  expect(await refused.json()).toEqual({ error: 'stale-version', version: after });
  expect((await get(`&v=${before}`)).status).toBe(409);
  expect((await get(`&v=${after}&variant=96c`)).status).toBe(200);
});

it('versions files that are not images and refuses a thumbnail for them', async () => {
  const { core, dm } = await fixture();
  const ref = await core.attachments.upload({
    name: 'notes.txt',
    data: (async function* () {
      yield Buffer.from('plain text');
    })(),
  });
  await core.channels.appendMessage(dm.id, {
    id: 'notes',
    at: new Date().toISOString(),
    author: { kind: 'bot', slug: 'ada' },
    body: 'Notes',
    attachments: [ref],
  });
  const facts = (await core.mediaVersions.ensure(ref.fileId!))!;
  expect(facts.width).toBeUndefined();
  const handle = createAttachmentHttp(
    core.attachments,
    core.channels,
    undefined,
    undefined,
    core.mediaVersions,
  );
  const base = `http://host/api/botharness/attachment?channelId=${dm.id}&messageId=notes&fileId=${ref.fileId}&v=${facts.version}`;
  expect((await handle(new Request(base + '&variant=320'))).status).toBe(422);
  expect((await handle(new Request(base))).status).toBe(200);
});

it('refuses a versioned request for a file the message does not own', async () => {
  const { core, dm, ref } = await fixture();
  const version = (await core.mediaVersions.ensure(ref.fileId!))!.version;
  const handle = createAttachmentHttp(
    core.attachments,
    core.channels,
    undefined,
    undefined,
    core.mediaVersions,
  );
  const response = await handle(
    new Request(
      `http://host/api/botharness/attachment?channelId=${dm.id}&messageId=missing&fileId=${ref.fileId}&v=${version}&variant=320`,
    ),
  );
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(response.headers.get('cache-control')).toBe('no-store');
});
