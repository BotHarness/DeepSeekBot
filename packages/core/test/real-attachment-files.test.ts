import { boundModelPage, readModelContent } from '../src/runtime/channel-model-read.js';
import { createHash, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAttachmentStore } from '../src/attachments/store.js';
import { createAttachmentHttp } from '../src/attachments/http.js';
import { createMessageAttachmentFiles } from '../src/attachments/message-files.js';
import { attachmentIdentity, isChannelAttachmentRef } from '../src/attachments/ref.js';
import { createChannelStore } from '../src/channels/store.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

async function* chunks(text: string) {
  yield Buffer.from(text);
}

it('versions all current attachment bytes and refuses unavailable or oversized review evidence', async () => {
  const files = createAttachmentStore({ rootDir: createTempRoot(), maxBytes: 100_000 });
  const ref = await files.upload({ data: chunks('a'.repeat(70_000)), name: 'agenda.txt' });
  const path = files.fileTarget(ref.fileId!).path;
  const original = files.contentVersion(ref);
  writeFileSync(path, 'a'.repeat(69_999) + 'b');
  expect(files.current(ref).size).toBe(ref.size);
  expect(files.contentVersion(ref)).not.toBe(original);
  writeFileSync(path, 'a'.repeat(100_001));
  expect(() => files.contentVersion(ref)).toThrow(/size limit/);
  writeFileSync(path, 'a');
  files.purgeReviewed(ref.fileId!, () => new Set());
  expect(() => files.contentVersion(ref)).toThrow(/purged|unavailable/);
});

function fixture(sqlite: boolean) {
  const root = createTempRoot();
  const files = createAttachmentStore({ rootDir: join(root, 'attachments') });
  const owner = sqlite
    ? trackTestOwner(
        mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
      )
    : undefined;
  const database = owner === undefined ? undefined : attachOperationalModule(owner, 'channels');
  const channels =
    database === undefined
      ? createChannelStore({ rootDir: join(root, 'channels'), attachments: files })
      : createSqliteChannelStore({ database, rootDir: join(root, 'channels'), attachments: files });
  const channel = channels.createGroup({ name: 'Current files', members: [] });
  return {
    root,
    files,
    owner,
    database,
    channels,
    channel,
    access: createMessageAttachmentFiles(channels, files),
  };
}

for (const sqlite of [false, true])
  describe(
    sqlite ? 'durable Messaging attachment files' : 'file Messaging attachment files',
    () => {
      it('isolates equal uploads, shares explicit references and projects current bytes without changing message authority', async () => {
        const { root, files, channels, channel, access, database, owner } = fixture(sqlite);
        const first = await files.upload({ data: chunks('initial'), name: '报告 notes.txt' });
        const independent = await files.upload({ data: chunks('initial'), name: '报告 notes.txt' });
        expect(attachmentIdentity(first)).not.toBe(attachmentIdentity(independent));
        expect(first.hash).toBeUndefined();
        const message = {
          id: 'first',
          at: new Date().toISOString(),
          author: { kind: 'human' as const },
          body: '',
          attachments: [first],
        };
        await channels.appendMessageOnce(channel.id, message);
        await channels.appendMessage(channel.id, { ...message, id: 'shared' });
        await channels.appendMessage(channel.id, {
          ...message,
          id: 'independent',
          attachments: [independent],
        });
        const authority = database?.read((db) =>
          db.prepare('SELECT payload_json FROM source_events ORDER BY source_event_id').all(),
        );
        const notifications: unknown[] = [];
        const unsubscribe = owner?.subscribe((event) => notifications.push(event));
        const revision = channels.revision(channel.id);
        const path = access.target(channel.id, 'first', first.fileId!).path;
        writeFileSync(path + '.replacement', 'external editor saved current bytes');
        renameSync(path + '.replacement', path);
        const current = { ...first, size: 35 };
        expect(channels.message(channel.id, 'first')?.attachments).toEqual([current]);
        expect(channels.message(channel.id, 'shared')?.attachments).toEqual([current]);
        const view = {
          channelId: channel.id,
          channelName: channel.name,
          message: channels.message(channel.id, 'first')!,
        };
        const page = JSON.parse(boundModelPage({ messages: [view] }, () => undefined).output);
        expect(page.messages[0].message.attachments).toEqual([current]);
        const content = JSON.parse(readModelContent(view).output);
        expect(JSON.parse(content.content).message.attachments).toEqual([current]);
        expect(JSON.stringify(page)).not.toContain(files.rootDir);
        expect(content.content).not.toContain(files.rootDir);

        expect(channels.message(channel.id, 'independent')?.attachments).toEqual([independent]);
        expect(
          channels.readMessages(channel.id).find((entry) => entry.id === 'first')?.attachments,
        ).toEqual([current]);
        expect(
          await new Response(
            (await access.download(channel.id, 'first', first.fileId!)).body,
          ).text(),
        ).toBe('external editor saved current bytes');
        expect(await new Response((await files.download(independent.fileId!)).body).text()).toBe(
          'initial',
        );
        expect(channels.revision(channel.id)).toBe(revision);
        if (database !== undefined)
          expect(
            database.read((db) =>
              db.prepare('SELECT payload_json FROM source_events ORDER BY source_event_id').all(),
            ),
          ).toEqual(authority);
        expect((await channels.appendMessageOnce(channel.id, message)).status).toBe('existing');
        expect(notifications).toEqual([]);
        unsubscribe?.();
        const restarted = createAttachmentStore({ rootDir: join(root, 'attachments') });
        expect(restarted.current(first)).toEqual(current);
        expect(restarted.fileTarget(first.fileId!).path).toBe(path);
        expect(
          files.sweepUnreferenced(new Date(Date.now() + 1000), () =>
            channels.referencedAttachmentHashes(),
          ),
        ).toBe(0);
        if (sqlite) {
          channels.deleteGroup(channel.id);
          expect(
            files.sweepUnreferenced(new Date(Date.now() + 1000), () =>
              channels.referencedAttachmentHashes(),
            ),
          ).toBe(0);
        }
        rmSync(path);
        expect(() => files.fileTarget(first.fileId!)).toThrow('unavailable');
        expect(() => access.target(channel.id, 'first', first.fileId!)).toThrow(
          sqlite ? 'not owned' : 'unavailable',
        );
        await expect(access.download(channel.id, 'first', first.fileId!)).rejects.toMatchObject({
          code: 'not-found',
        });
        expect(existsSync(path)).toBe(false);
      });

      it('checks message ownership, profile records, current MIME and exact identities on every action', async () => {
        const { files, channels, channel, access } = fixture(sqlite);
        const ref = await files.upload({ data: chunks('%PDF-1.7'), name: 'document.pdf' });
        const other = channels.createGroup({ name: 'Other', members: [] });
        await channels.appendMessage(channel.id, {
          id: 'file',
          at: new Date().toISOString(),
          author: { kind: 'human' },
          body: '',
          attachments: [ref],
        });
        expect(() => access.target(other.id, 'file', ref.fileId!)).toThrow('not owned');
        expect(() => access.target(channel.id, 'wrong', ref.fileId!)).toThrow('not owned');
        expect(() => access.target(channel.id, 'file', 'file:' + randomUUID())).toThrow(
          'not owned',
        );
        expect(() => access.target(channel.id, 'file', '../outside')).toThrow('not owned');
        const foreign = createAttachmentStore({ rootDir: createTempRoot() });
        expect(foreign.has(ref)).toBe(false);
        const path = access.target(channel.id, 'file', ref.fileId!).path;
        writeFileSync(path, '<script>text, never HTML</script>');
        expect(channels.message(channel.id, 'file')?.attachments?.[0]?.mime).toBe('text/plain');
        const http = createAttachmentHttp(files, channels);
        const url = new URL('http://local/api/botharness/attachment');
        url.search = new URLSearchParams({
          channelId: channel.id,
          messageId: 'file',
          fileId: ref.fileId!,
        }).toString();
        const response = await http(new Request(url));
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('content-type')).toBe('text/plain');
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(response.headers.get('content-disposition')).toMatch(/^attachment;/u);
        expect(await response.text()).toBe('<script>text, never HTML</script>');
        url.searchParams.set('channelId', other.id);
        expect((await http(new Request(url))).status).toBe(404);
        expect(
          (await http(new Request('http://local/api/botharness/attachment?fileId=' + ref.fileId)))
            .status,
        ).toBe(400);
        rmSync(path);
        const outside = join(createTempRoot(), 'outside');
        writeFileSync(outside, 'secret');
        symlinkSync(outside, path);
        expect(() => access.target(channel.id, 'file', ref.fileId!)).toThrow('unavailable');
        await expect(files.download(ref.fileId!)).rejects.toMatchObject({ code: 'not-found' });
      });
    },
  );

it('retries one transfer across restarts without overwriting an edited file or publishing duplicate identities', async () => {
  const root = createTempRoot();
  let files = createAttachmentStore({ rootDir: root });
  const uploadId = randomUUID();
  const first = await files.upload({ data: chunks('upload source'), name: 'notes.txt', uploadId });
  const path = files.fileTarget(first.fileId!).path;
  writeFileSync(path, 'edited destination');
  files = createAttachmentStore({ rootDir: root });
  expect(
    await files.upload({ data: chunks('upload source'), name: 'notes.txt', uploadId }),
  ).toEqual(first);
  expect(readFileSync(path, 'utf8')).toBe('edited destination');
  await expect(
    files.upload({ data: chunks('different'), name: 'notes.txt', uploadId }),
  ).rejects.toMatchObject({ code: 'invalid-ref' });
  const parallelId = randomUUID();
  const [a, b, c] = await Promise.all(
    Array.from({ length: 3 }, () =>
      files.upload({ data: chunks('parallel'), uploadId: parallelId, name: 'parallel.txt' }),
    ),
  );
  expect(a).toEqual(b);
  expect(b).toEqual(c);
  expect(files.sweepUnreferenced(new Date(Date.now() + 1000), () => new Set([first.fileId!]))).toBe(
    1,
  );
  expect(files.has(first)).toBe(true);
});

it('validates exclusive real and legacy references and keeps portable filenames and extensions', async () => {
  const files = createAttachmentStore({ rootDir: createTempRoot() });
  const ref = await files.upload({ data: chunks('text'), name: '../CON:报告?.txt' });
  expect(ref.name).toBe('CON_报告_.txt');
  expect(isChannelAttachmentRef(ref)).toBe(true);
  expect(
    isChannelAttachmentRef({
      ...ref,
      hash: 'sha256:' + createHash('sha256').update('text').digest('hex'),
    }),
  ).toBe(false);
  expect(isChannelAttachmentRef({ ...ref, fileId: '../escape' })).toBe(false);
  const long = await files.upload({ data: chunks('text'), name: '报'.repeat(175) + '.txt' });
  expect(Buffer.byteLength(long.name)).toBeLessThanOrEqual(240);
  expect(long.name.endsWith('.txt')).toBe(true);
  const ascii = await files.upload({ data: chunks('text'), name: 'a'.repeat(200) + '.mdx' });
  expect(ascii.name.length).toBe(180);
  expect(ascii.name.endsWith('.mdx')).toBe(true);
});

it('refuses redirected storage directories during upload and cleanup', async () => {
  const root = createTempRoot();
  const outside = createTempRoot();
  const files = createAttachmentStore({ rootDir: root });
  symlinkSync(outside, join(root, 'files'));
  await expect(files.upload({ data: chunks('source'), name: 'notes.txt' })).rejects.toMatchObject({
    code: 'not-found',
  });
  expect(() => files.sweepUnreferenced(new Date(Date.now() + 1000), () => new Set())).toThrow(
    'directory is unavailable',
  );
  expect(existsSync(outside)).toBe(true);
  rmSync(join(root, 'files'));
  rmSync(join(root, 'staging'), { recursive: true });
  symlinkSync(outside, join(root, 'staging'));
  await expect(files.upload({ data: chunks('source'), name: 'notes.txt' })).rejects.toMatchObject({
    code: 'not-found',
  });
});

it('bounds an opened download to its measured length, including initially empty files', async () => {
  const files = createAttachmentStore({ rootDir: createTempRoot() });
  for (const initial of ['', 'a'.repeat(256 * 1024)]) {
    const ref = await files.upload({ data: chunks(initial), name: 'changing.txt' });
    const download = await files.download(ref.fileId!);
    appendFileSync(files.fileTarget(ref.fileId!).path, 'appended after open');
    expect(download.ref.size).toBe(Buffer.byteLength(initial));
    expect(await new Response(download.body).text()).toBe(initial);
    expect((await files.download(ref.fileId!)).ref.size).toBe(Buffer.byteLength(initial) + 19);
  }
});

it('recovers an interrupted unpublished transfer but retains a damaged existing receipt', async () => {
  const root = createTempRoot();
  const uploadId = randomUUID();
  const dir = join(root, 'files', uploadId);
  mkdirSync(join(dir, 'data'), { recursive: true });
  writeFileSync(join(dir, 'data', 'notes.txt'), 'interrupted transfer');
  const files = createAttachmentStore({ rootDir: root });
  const ref = await files.upload({
    data: chunks('complete transfer'),
    name: 'notes.txt',
    uploadId,
  });
  expect(ref.fileId).toBe('file:' + uploadId);
  expect(await new Response((await files.download(ref.fileId!)).body).text()).toBe(
    'complete transfer',
  );
  const path = files.fileTarget(ref.fileId!).path;
  writeFileSync(path, 'external edit');
  writeFileSync(join(dir, 'record.json'), '{damaged receipt');
  await expect(
    files.upload({ data: chunks('complete transfer'), name: 'notes.txt', uploadId }),
  ).rejects.toMatchObject({ code: 'not-found' });
  expect(readFileSync(path, 'utf8')).toBe('external edit');
  expect(readFileSync(join(dir, 'record.json'), 'utf8')).toBe('{damaged receipt');
});
