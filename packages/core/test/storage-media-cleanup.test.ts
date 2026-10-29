import { realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAttachmentStore } from '../src/attachments/store.js';
import type { ChannelMessage } from '../src/channels/channel.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createStorageCleanup, StorageCleanupError } from '../src/storage/media-cleanup.js';
import { createTempRoot } from './helpers.js';

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});

async function fixture() {
  const home = realpathSync(createTempRoot('bh-storage-cleanup-'));
  const database = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  cleanup.push(() => {
    database.close();
    rmSync(home, { recursive: true, force: true });
  });
  const attachments = createAttachmentStore({ rootDir: join(home, 'botharness', 'attachments') });
  const channels = createSqliteChannelStore({
    database: attachOperationalModule(database, 'channel-test'),
    databaseOwnerReady: true,
    rootDir: join(home, 'botharness', 'channels'),
    attachments,
  });
  channels.getOrCreateDm('ada', 'Ada');
  const upload = (name: string, bytes: Buffer) =>
    attachments.upload({
      data: (async function* () {
        yield bytes;
      })(),
      name,
    });
  let sequence = 0;
  const send = (at: string, refs: NonNullable<ChannelMessage['attachments']>) => {
    sequence += 1;
    return channels.appendMessage('dm-ada', {
      id: `m-${sequence}`,
      at,
      author: { kind: 'human' },
      body: `message ${sequence}`,
      attachments: refs,
    });
  };
  const settle = () =>
    attachOperationalModule(database, 'test').transaction((db) =>
      db.prepare("UPDATE inbox_admissions SET attempt_state = 'handled'").run(),
    );
  const storage = createStorageCleanup({
    dshHome: home,
    database,
    attachments,
    channels,
    memoryDirs: () => [],
    memoryReferences: () => [],
    botName: () => 'Ada',
    now: () => new Date('2026-10-20T00:00:00.000Z'),
  });
  return { attachments, channels, upload, send, settle, storage };
}

describe('storage media cleanup', () => {
  it('reports usage per chat and media kind', async () => {
    const f = await fixture();
    const image = await f.upload('a.png', PNG);
    const doc = await f.upload('notes.txt', Buffer.from('hello notes'));
    await f.send('2026-01-01T00:00:00.000Z', [image, doc]);
    const usage = f.storage.usage();
    expect(usage.chats).toEqual([
      expect.objectContaining({
        channelId: 'dm-ada',
        name: 'Ada',
        messages: 1,
        mediaBytes: image.size + doc.size,
        oldestAt: '2026-01-01T00:00:00.000Z',
        media: [
          { kind: 'image', count: 1, bytes: image.size },
          { kind: 'file', count: 1, bytes: doc.size },
        ],
      }),
    ]);
    expect(usage.parts.find((part) => part.kind === 'media')?.bytes).toBeGreaterThanOrEqual(
      image.size + doc.size,
    );
  });

  it('clears old images, keeps text and other files, and frees the bytes', async () => {
    const f = await fixture();
    const image = await f.upload('a.png', PNG);
    const doc = await f.upload('notes.txt', Buffer.from('hello notes'));
    const recent = await f.upload('b.png', Buffer.concat([PNG, Buffer.from([1])]));
    const old = await f.send('2026-01-01T00:00:00.000Z', [image, doc]);
    await f.send('2026-10-01T00:00:00.000Z', [recent]);
    f.settle();

    const scope = { before: '2026-06-01T00:00:00.000Z', kinds: ['image' as const] };
    const preview = f.storage.preview(scope);
    expect(preview).toMatchObject({
      messages: 1,
      files: 1,
      bytes: image.size,
      freedBytes: image.size,
      kept: [],
      chats: [{ channelId: 'dm-ada', name: 'Ada', files: 1, bytes: image.size }],
    });

    expect(f.storage.confirm(scope, preview.token)).toEqual({
      messages: 1,
      files: 1,
      freedBytes: image.size,
      removedFiles: 1,
      pendingFiles: 0,
    });
    const after = f.channels.readMessages('dm-ada');
    const cleared = after.find((item) => item.id === old!.id)!;
    expect(cleared.body).toBe('message 1');
    expect(cleared.attachments).toEqual([doc]);
    expect(cleared.clearedAttachments).toEqual([
      { name: 'a.png', mime: 'image/png', size: image.size, clearedAt: '2026-10-20T00:00:00.000Z' },
    ]);
    expect(after.find((item) => item.attachments?.[0]?.name === 'b.png')).toBeDefined();
    expect(f.attachments.has(image)).toBe(false);
    expect(f.attachments.has(doc)).toBe(true);
    expect(f.attachments.has(recent)).toBe(true);

    expect(() => f.storage.confirm(scope, preview.token)).toThrow(StorageCleanupError);
  });

  it('keeps media a Bot is still working on', async () => {
    const f = await fixture();
    const image = await f.upload('a.png', PNG);
    await f.send('2026-01-01T00:00:00.000Z', [image]);
    const preview = f.storage.preview({ before: '2026-06-01T00:00:00.000Z' });
    expect(preview).toMatchObject({
      messages: 0,
      files: 0,
      kept: [{ reason: 'bot-working', files: 1 }],
    });
  });

  it('treats a cutoff ahead of the Host clock as now, so any age clears everything', async () => {
    const f = await fixture();
    const image = await f.upload('a.png', PNG);
    await f.send('2026-10-19T23:59:00.000Z', [image]);
    f.settle();
    const preview = f.storage.preview({ before: '2026-10-20T00:05:00.000Z' });
    expect(preview).toMatchObject({ files: 1, scope: { before: '2026-10-20T00:00:00.000Z' } });
    expect(f.storage.confirm(preview.scope, preview.token)).toMatchObject({ files: 1 });
    expect(f.attachments.has(image)).toBe(false);
  });

  it('refuses a token when the scope changed after the preview', async () => {
    const f = await fixture();
    const image = await f.upload('a.png', PNG);
    await f.send('2026-01-01T00:00:00.000Z', [image]);
    f.settle();
    const preview = f.storage.preview({ before: '2026-06-01T00:00:00.000Z' });
    const other = await f.upload('c.png', Buffer.concat([PNG, Buffer.from([2])]));
    await f.send('2026-02-01T00:00:00.000Z', [other]);
    f.settle();
    expect(() => f.storage.confirm({ before: '2026-06-01T00:00:00.000Z' }, preview.token)).toThrow(
      'changed',
    );
    expect(f.attachments.has(image)).toBe(true);
  });
});
