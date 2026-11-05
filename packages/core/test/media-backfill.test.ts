import sharp from 'sharp';
import { afterEach, expect, it, vi } from 'vitest';

import { backfillMediaVersions } from '../src/attachments/media-backfill.js';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';

const cores: ReturnType<typeof createCore>[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

async function upgradedHost(images: number) {
  const core = createCore({ dshHome: createTempRoot('bh-media-backfill-') });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
  const files = [];
  for (let index = 0; index < images; index += 1) {
    const bytes = await sharp({
      create: { width: 64, height: 48, channels: 3, background: { r: index * 40, g: 9, b: 9 } },
    })
      .png()
      .toBuffer();
    files.push(
      await core.attachments.upload({
        name: `old-${index}.png`,
        data: (async function* () {
          yield bytes;
        })(),
      }),
    );
  }
  await core.channels.appendMessage(dm.id, {
    id: 'old',
    at: new Date().toISOString(),
    author: { kind: 'bot', slug: 'ada' },
    body: 'from before the upgrade',
    attachments: files,
  });
  const fileIds = () => core.channels.referencedAttachmentHashes();
  return { core, dm, files, fileIds };
}

const instant = { sleep: async () => undefined };

it('versions every existing attachment once and skips them on the next run', async () => {
  const { core, dm, files, fileIds } = await upgradedHost(3);
  const first = await backfillMediaVersions({ fileIds, versions: core.mediaVersions, ...instant });
  expect(first).toMatchObject({ checked: 3, failed: 0, stopped: false });
  expect(first.computed).toBeGreaterThan(0);
  expect(files.every((file) => core.mediaVersions.known(file.fileId!))).toBe(true);
  const attachments = core.channels.message(dm.id, 'old')!.attachments!;
  for (const ref of attachments) {
    expect(ref.version).toMatch(/^[0-9a-f]{32}$/u);
    expect(ref).toMatchObject({ width: 64, height: 48 });
  }
  const again = await backfillMediaVersions({ fileIds, versions: core.mediaVersions, ...instant });
  expect(again).toMatchObject({ checked: 3, computed: 0 });
});

it('stops when asked and resumes where it stopped after a restart', async () => {
  const { core, fileIds } = await upgradedHost(3);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const controller = new AbortController();
  const stopped = await backfillMediaVersions({
    fileIds,
    versions: core.mediaVersions,
    signal: controller.signal,
    sleep: async () => controller.abort(),
  });
  expect(stopped).toMatchObject({ stopped: true });
  expect(stopped.checked).toBeLessThan(3);
  const left = [...fileIds()].filter((fileId) => !core.mediaVersions.known(fileId)).length;
  const resumed = await backfillMediaVersions({
    fileIds,
    versions: core.mediaVersions,
    ...instant,
  });
  expect(resumed).toMatchObject({ checked: 3, stopped: false });
  expect(resumed.computed).toBeLessThanOrEqual(left);
  expect([...fileIds()].every((fileId) => core.mediaVersions.known(fileId))).toBe(true);
});

it('rests four times as long as it works, keeping to a fifth of one core', async () => {
  let clock = 0;
  const pauses: number[] = [];
  const ensure = vi.fn(async () => {
    clock += 50;
    return { version: 'v' };
  });
  await backfillMediaVersions({
    fileIds: () => ['file:00000000-0000-4000-8000-000000000001', 'not-a-file', 'sha256:abc'],
    versions: { known: () => false, ensure },
    now: () => clock,
    sleep: async (ms) => {
      pauses.push(ms);
    },
  });
  expect(ensure).toHaveBeenCalledTimes(1);
  expect(pauses).toEqual([200]);
});
