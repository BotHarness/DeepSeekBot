import { afterEach, expect, it } from 'vitest';

import { CHANNEL_FILES_SCAN } from '../src/channels/timeline.js';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';

const cores: ReturnType<typeof createCore>[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

async function channelWith(count: number, withFile: (index: number) => boolean) {
  const core = createCore({ dshHome: createTempRoot('bh-channel-files-') });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
  const file = await core.attachments.upload({
    name: 'note.txt',
    data: (async function* () {
      yield Buffer.from('n');
    })(),
  });
  for (let index = 0; index < count; index += 1)
    await core.channels.appendMessage(dm.id, {
      id: `m${index}`,
      at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      author: { kind: 'bot', slug: 'ada' },
      body: `message ${index}`,
      ...(withFile(index) ? { attachments: [file] } : {}),
    });
  return { core, dm };
}

it('pages only messages with files, newest first, without reading the whole history', async () => {
  const { core, dm } = await channelWith(60, (index) => index % 10 === 0);
  const first = core.channels.readHumanFilesPage(dm.id, { limit: 4 })!;
  expect(first.entries.map((entry) => entry.message.id)).toEqual(['m20', 'm30', 'm40', 'm50']);
  expect(first.entries[0]!.message.attachments).toHaveLength(1);
  const second = core.channels.readHumanFilesPage(dm.id, { limit: 4, before: first.nextBefore })!;
  expect(second.entries.map((entry) => entry.message.id)).toEqual(['m0', 'm10']);
  expect(second.nextBefore).toBeUndefined();
});

it('stops scanning after a fixed window and hands back a cursor to continue', async () => {
  const { core, dm } = await channelWith(CHANNEL_FILES_SCAN + 50, (index) => index < 3);
  const first = core.channels.readHumanFilesPage(dm.id, {})!;
  expect(first.entries).toEqual([]);
  expect(first.nextBefore).toBeGreaterThan(1);
  const next = core.channels.readHumanFilesPage(dm.id, { before: first.nextBefore })!;
  expect(next.entries.map((entry) => entry.message.id)).toEqual(['m0', 'm1', 'm2']);
  expect(next.nextBefore).toBeUndefined();
}, 60_000);
