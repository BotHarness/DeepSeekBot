import { seededBannerRecipe } from '@botharness/pixel-banner';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOT_BANNER_PATH, botBannerSummary, createBotBannerHttp } from '../src/bots/banner-http.js';
import {
  botBannerPng,
  encodeRgbaPng,
  isBotBanner,
  isBotBannerImage,
  type BotBanner,
} from '../src/bots/bot-banner.js';
import { backfillBotBanners, syncBotDescriptor } from '../src/bots/bot-descriptor-sync.js';
import { createBotZipHttp } from '../src/bots/bot-zip-http.js';
import { readSharedBanner } from '../src/bots/shared-presentation.js';
import { readZip } from '../src/bots/zip-archive.js';
import { parseBotDescriptor } from '../src/marketplace/descriptor.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { createTestRegistry } from './registry-fixture.js';
import { createTempRoot } from './helpers.js';

function registryAt() {
  const root = createTempRoot('botharness-banner-');
  return createTestRegistry({
    rootDir: join(root, 'bots'),
    initializeMemory: (memoryDir) => ({ ok: ensureMemoryRepository({ memoryDir }).ok }),
    syncDescriptor: (memoryDir, record, options) => syncBotDescriptor(memoryDir, record, options),
  });
}

function pngUrl(width: number, height: number): string {
  const rgba = new Uint8Array(width * height * 4).map((_, i) => (i % 4 === 3 ? 255 : i % 251));
  return `data:image/png;base64,${encodeRgbaPng(width, height, rgba).toString('base64')}`;
}

function pngSize(bytes: Buffer): [number, number] {
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

function descriptorOf(memoryDir: string) {
  return parseBotDescriptor(readFileSync(join(memoryDir, '.botharness/bot.json'), 'utf8'));
}

const UPLOAD = pngUrl(30, 10);

describe('Bot banner', () => {
  it('seeds a banner from the name at creation and keeps it through a rename', () => {
    const registry = registryAt();
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const seeded: BotBanner = { recipe: seededBannerRecipe('Ada') };
    expect(registry.get('ada')?.banner).toEqual(seeded);
    expect(registry.update('ada', { displayName: 'Ada Lovelace' }).ok).toBe(true);
    expect(registry.get('ada')?.banner).toEqual(seeded);

    const memoryDir = registry.memoryDirFor('ada')!;
    expect(descriptorOf(memoryDir)?.banner).toEqual(seeded);
    const png = readFileSync(join(memoryDir, '.botharness/banner.png'));
    expect(pngSize(png)).toEqual([1500, 500]);
    expect(png.equals(botBannerPng(seeded))).toBe(true);
  });

  it('writes the recipe or the uploaded image to bot.json and banner.png', () => {
    const registry = registryAt();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const memoryDir = registry.memoryDirFor('ada')!;

    expect(registry.setBanner('ada', { recipe: { scene: 'space', seed: 7 } }).ok).toBe(true);
    expect(descriptorOf(memoryDir)?.banner).toEqual({ recipe: { scene: 'space', seed: 7 } });
    expect(readSharedBanner(memoryDir)).toEqual({ recipe: { scene: 'space', seed: 7 } });

    expect(registry.setBanner('ada', { image: UPLOAD }).ok).toBe(true);
    expect(descriptorOf(memoryDir)?.banner).toEqual({ image: '.botharness/banner.png' });
    const png = readFileSync(join(memoryDir, '.botharness/banner.png'));
    expect(`data:image/png;base64,${png.toString('base64')}`).toBe(UPLOAD);
    expect(readSharedBanner(memoryDir)).toEqual({ image: UPLOAD });
  });

  it('refuses banners that are not a known scene or a bounded 3:1 PNG', () => {
    const registry = registryAt();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    for (const banner of [
      { recipe: { scene: 'beach', seed: 1 } },
      { recipe: { scene: 'sea', seed: -1 } },
      { image: pngUrl(20, 10) },
      { image: 'data:image/webp;base64,AAAA' },
      { recipe: { scene: 'sea', seed: 1 }, image: UPLOAD },
    ]) {
      expect(isBotBanner(banner), JSON.stringify(banner).slice(0, 60)).toBe(false);
      expect(registry.setBanner('ada', banner)).toEqual({ ok: false, reason: 'invalid-input' });
    }
    expect(isBotBannerImage(pngUrl(3001, 1000) as string)).toBe(false);
  });

  it('carries recipe and uploaded banners through a Bot Zip export and import', async () => {
    const registry = registryAt();
    registry.create({ slug: 'sea', displayName: 'Sea', persona: '# Sea\n' });
    registry.setBanner('sea', { recipe: { scene: 'sea', seed: 99 } });
    registry.create({ slug: 'photo', displayName: 'Photo', persona: '# Photo\n' });
    registry.setBanner('photo', { image: UPLOAD });
    let next = 0;
    const http = createBotZipHttp({
      registry,
      createBotId: () => `copy-${++next}`,
      detail: (slug) => ({ ok: true, value: { bot: registry.get(slug)! } }),
    });

    for (const [slug, expected] of [
      ['sea', { recipe: { scene: 'sea', seed: 99 } }],
      ['photo', { image: UPLOAD }],
    ] as const) {
      const exported = await http(
        new Request(`http://host/api/botharness/bot-zip?slug=${slug}&include=SOUL.md`),
      );
      const archive = Buffer.from(await exported.arrayBuffer());
      const paths = readZip(archive, { maxEntries: 100, maxTotalBytes: 8 << 20 }).map(
        (entry) => entry.path,
      );
      expect(paths).toContain('.botharness/banner.png');
      const imported = await http(
        new Request('http://host/api/botharness/bot-zip/import?name=Copy.zip', {
          method: 'POST',
          headers: { 'content-type': 'application/zip' },
          body: new Uint8Array(archive),
        }),
      );
      const body = (await imported.json()) as { bot: { slug: string } };
      expect(registry.get(body.bot.slug)?.banner).toEqual(expected);
    }
  });

  it('gives existing Bots a seeded banner at Host startup', () => {
    const registry = registryAt();
    registry.create({ slug: 'old', displayName: 'Old' });
    const record = registry.get('old')!;
    delete record.banner;
    const lacking = { ...registry, list: () => [record] };
    backfillBotBanners(lacking);
    expect(registry.get('old')?.banner).toEqual({ recipe: seededBannerRecipe('Old') });
  });

  it('serves an uploaded banner as a versioned PNG and a recipe as itself', async () => {
    const registry = registryAt();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    registry.setBanner('ada', { image: UPLOAD });
    const summary = botBannerSummary('ada', registry.get('ada')!.banner!);
    expect(summary).toEqual({
      image: expect.stringMatching(/^\/api\/botharness\/bot-banner\?slug=ada&v=/u),
    });
    const http = createBotBannerHttp(registry);
    const response = await http(new Request(`http://host${(summary as { image: string }).image}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await response.arrayBuffer()).toString('base64')).toBe(
      UPLOAD.slice('data:image/png;base64,'.length),
    );
    expect((await http(new Request(`http://host${BOT_BANNER_PATH}?slug=ada&v=stale`))).status).toBe(
      404,
    );
    expect(botBannerSummary('ada', { recipe: { scene: 'sea', seed: 1 } })).toEqual({
      recipe: { scene: 'sea', seed: 1 },
    });
  });
});

it('drops a damaged stored banner instead of hiding the Bot', () => {
  const root = createTempRoot('botharness-banner-legacy-');
  mkdirSync(join(root, 'ada'));
  writeFileSync(
    join(root, 'ada', 'bot.json'),
    JSON.stringify({
      slug: 'ada',
      displayName: 'Ada',
      workspaces: [],
      createdAt: '2026-10-08T00:00:00Z',
      banner: { recipe: { scene: 'mars', seed: 1 } },
    }),
  );
  const bot = createTestRegistry({ rootDir: root }).get('ada');
  expect(bot?.displayName).toBe('Ada');
  expect(bot?.banner).toBeUndefined();
});
