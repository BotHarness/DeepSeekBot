import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { afterEach, expect, it } from 'vitest';

import { createAttachmentHttp } from '../src/attachments/http.js';
import type { ChannelLiveFrame } from '../src/channels/live.js';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';

const cores: ReturnType<typeof createCore>[] = [];
const aborts: AbortController[] = [];
afterEach(async () => {
  for (const abort of aborts.splice(0)) abort.abort();
  for (const core of cores.splice(0)) {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

const png = (r: number) =>
  sharp({ create: { width: 640, height: 480, channels: 3, background: { r, g: 80, b: 40 } } })
    .png()
    .toBuffer();

async function fixture() {
  const core = createCore({ dshHome: createTempRoot('bh-media-notify-') });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
  const handle = createAttachmentHttp(
    core.attachments,
    core.channels,
    undefined,
    undefined,
    core.mediaVersions,
  );
  return { core, dm, handle };
}

it('versions an upload before answering it', async () => {
  const { core, handle } = await fixture();
  const response = await handle(
    new Request('http://host/api/botharness/attachment/upload?name=photo.png', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: new Uint8Array(await png(200)),
    }),
  );
  const { attachment } = (await response.json()) as { attachment: { fileId: string } };
  expect(core.mediaVersions.known(attachment.fileId)).toBe(true);
});

it('logs and pushes a new version when an original is edited outside the app (#47)', async () => {
  const { core, dm } = await fixture();
  const ref = await core.attachments.upload({
    name: 'photo.png',
    data: (async function* () {
      yield await png(200);
    })(),
  });
  await core.channels.appendMessage(dm.id, {
    id: 'photo',
    at: new Date().toISOString(),
    author: { kind: 'bot', slug: 'ada' },
    body: 'Here',
    attachments: [ref],
  });
  const before = (await core.mediaVersions.ensure(ref.fileId!))!.version;
  const cursor = core.channels.changeCursor!();
  const abort = new AbortController();
  aborts.push(abort);
  const frames = core.live.followChannel(dm.id, 0, abort.signal)[Symbol.asyncIterator]();
  const notifications: ChannelLiveFrame[] = [];
  const collect = (async () => {
    for (;;) {
      const next = await frames.next();
      if (next.done) return;
      notifications.push(next.value);
    }
  })();

  writeFileSync(core.attachments.fileTarget(ref.fileId!).path, await png(20));
  core.channels.message(dm.id, 'photo');
  const after = (await core.mediaVersions.ensure(ref.fileId!))!.version;
  expect(after).not.toBe(before);

  const changes = core.channels.readHumanChanges!(dm.id, {
    sinceSeq: cursor.seq,
    epoch: cursor.epoch,
  })!;
  if (changes.reset) throw new Error('unexpected reset');
  expect(changes.upserts.map((entry) => entry.message.attachments?.[0]?.version)).toContain(after);
  for (let tries = 0; tries < 50; tries += 1) {
    if (
      notifications.some(
        (frame) =>
          frame.type === 'notification' &&
          frame.notification.kind === 'attachments' &&
          frame.notification.attachments[0]?.version === after,
      )
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(notifications).toContainEqual({
    type: 'notification',
    notification: expect.objectContaining({
      kind: 'attachments',
      channelId: dm.id,
      messageId: 'photo',
      attachments: [expect.objectContaining({ fileId: ref.fileId, version: after })],
      clearedAttachments: [],
    }),
  });
  abort.abort();
  await collect.catch(() => undefined);
});
