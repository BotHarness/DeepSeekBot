import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ChannelAttachmentError,
  createAttachmentStore,
  safeAttachmentName,
  sniffAttachmentMime,
} from '../src/attachments/store.js';

const roots: string[] = [];
function root(): string {
  const path = mkdtempSync(join(tmpdir(), 'botharness-attachment-'));
  roots.push(path);
  return path;
}
afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});
async function* chunks(...values: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const value of values) yield value;
}

describe('profile attachment storage', () => {
  it('lets an independent waiter retry after a concurrent acquisition fails', async () => {
    const store = createAttachmentStore({ rootDir: root() });
    const uploadId = '01234567-0123-4123-8123-0123456789ab';
    let fail = (_error: Error): void => {};
    const first = store.acquire({
      uploadId,
      name: 'source.zip',
      signal: new AbortController().signal,
      load: () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    });
    const firstFailure = expect(first).rejects.toThrow('first transfer cancelled');
    const load = vi.fn(async () => chunks(Buffer.from('second transfer')));
    const second = store.acquire({
      uploadId,
      name: 'source.zip',
      signal: new AbortController().signal,
      load,
    });
    const secondSuccess = expect(second).resolves.toMatchObject({ fileId: 'file:' + uploadId });
    fail(new Error('first transfer cancelled'));
    await firstFailure;
    await secondSuccess;
    expect(load).toHaveBeenCalledTimes(1);
    expect(await new Response((await store.download('file:' + uploadId)).body).text()).toBe(
      'second transfer',
    );
  });

  it('keeps legacy objects readable and still verifies their bytes', async () => {
    const home = root();
    const store = createAttachmentStore({ rootDir: home });
    const bytes = Buffer.from('legacy bytes');
    const hash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const path = join(home, 'objects', hash.slice(7, 9), hash.slice(7));
    mkdirSync(join(home, 'objects', hash.slice(7, 9)), { recursive: true });
    writeFileSync(path, bytes);
    const legacy = { hash, name: 'legacy.txt', mime: 'text/plain', size: bytes.length };
    expect(store.has(legacy)).toBe(true);
    expect(store.has({ ...legacy, mime: 'text/html' })).toBe(false);
    expect(await new Response((await store.download(hash, legacy.name)).body).text()).toBe(
      'legacy bytes',
    );
    expect(() => store.fileTarget(hash)).toThrow('Invalid attachment identity');
    writeFileSync(path, 'changed bytes');
    await expect(
      new Response((await store.download(hash, legacy.name)).body).text(),
    ).rejects.toMatchObject({ code: 'corrupt' });
  });

  it('rejects oversized streams without publishing a ref or leaving a staged part', async () => {
    const home = root();
    const store = createAttachmentStore({ rootDir: home, maxBytes: 3 });
    await expect(
      store.upload({ data: chunks(Uint8Array.from([1, 2]), Uint8Array.from([3, 4])) }),
    ).rejects.toMatchObject({ code: 'too-large' });
    expect(readdirSync(join(home, 'staging'))).toEqual([]);
    expect(existsSync(join(home, 'objects'))).toBe(false);
  });

  it('uses server-side MIME, safe filenames, and rejects unknown object hashes', async () => {
    const store = createAttachmentStore({ rootDir: root() });
    const pdf = await store.upload({
      data: chunks(Buffer.from('%PDF-1.7')),
      name: '..\\draft.pdf',
    });
    expect(pdf.name).toBe('draft.pdf');
    expect(pdf.mime).toBe('application/pdf');
    expect(sniffAttachmentMime(Buffer.from('hello'))).toBe('text/plain');
    expect(sniffAttachmentMime(Uint8Array.from([0, 255]))).toBe('application/octet-stream');
    expect(safeAttachmentName('../')).toBe('attachment');
    await expect(store.download('bad')).rejects.toBeInstanceOf(ChannelAttachmentError);
    await expect(store.download('sha256:' + '0'.repeat(64))).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it.each([
    {
      scenario: 'one byte of a character at the sample boundary',
      bytes: Buffer.from('# '.padEnd(511, 'a') + '界\n'),
      mime: 'text/plain',
    },
    {
      scenario: 'three bytes of a character at the sample boundary',
      bytes: Buffer.from('a'.repeat(509) + '🌏'),
      mime: 'text/plain',
    },
    { scenario: 'a short complete file', bytes: Buffer.from('界🌏\n'), mime: 'text/plain' },
    {
      scenario: 'a truncated character at the end of a short file',
      bytes: Buffer.from([0x61, 0xe7, 0x95]),
      mime: 'application/octet-stream',
    },
    {
      scenario: 'a truncated character at EOF exactly at the sample limit',
      bytes: Buffer.concat([Buffer.alloc(511, 0x61), Buffer.from([0xe7])]),
      mime: 'application/octet-stream',
    },
    {
      scenario: 'malformed bytes inside the sample before a split character',
      bytes: Buffer.concat([Buffer.from([0xc0, 0xaf]), Buffer.from('a'.repeat(509) + '界')]),
      mime: 'application/octet-stream',
    },
    {
      scenario: 'an invalid continuation byte at the sample boundary',
      bytes: Buffer.concat([Buffer.alloc(510, 0x61), Buffer.from([0xf0, 0x80, 0x80, 0x80])]),
      mime: 'application/octet-stream',
    },
    {
      scenario: 'a binary control byte before a split character',
      bytes: Buffer.from('\0' + 'a'.repeat(510) + '界'),
      mime: 'application/octet-stream',
    },
  ])('sniffs UTF-8 on upload and current-file reads: $scenario', async ({ bytes, mime }) => {
    const store = createAttachmentStore({ rootDir: root() });
    const uploaded = await store.upload({ data: chunks(bytes), name: 'report.md' });
    const downloaded = await store.download(uploaded.fileId ?? uploaded.hash);

    expect(Buffer.from(await new Response(downloaded.body).arrayBuffer())).toEqual(bytes);
    expect({ upload: uploaded.mime, current: downloaded.ref.mime }).toEqual({
      upload: mime,
      current: mime,
    });
  });

  it('sweeps only old incomplete staging files, never committed objects', async () => {
    const home = root();
    const store = createAttachmentStore({ rootDir: home });
    const ref = await store.upload({ data: chunks(Buffer.from('kept')), name: 'kept.txt' });
    const staging = join(home, 'staging');
    mkdirSync(staging, { recursive: true });
    const old = join(staging, '00000000-0000-0000-0000-000000000000.part');
    const fresh = join(staging, '11111111-1111-1111-1111-111111111111.part');
    writeFileSync(old, 'old');
    writeFileSync(fresh, 'fresh');
    utimesSync(old, new Date(0), new Date(0));
    expect(await store.sweepStaged(new Date(1000))).toBe(1);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(store.has(ref)).toBe(true);
  });
});

it('recognizes a bounded MP4 ftyp header without labelling other ISO containers or forged extensions as playable video', () => {
  const bytes = Buffer.from(
    '000000186674797069736f6d0000020069736f6d6d703432000000086d646174',
    'hex',
  );
  expect(sniffAttachmentMime(bytes)).toBe('video/mp4');
  const heic = Buffer.from(bytes);
  heic.write('heic', 8);
  expect(sniffAttachmentMime(heic)).not.toBe('video/mp4');
  const oversized = Buffer.from(bytes);
  oversized.writeUInt32BE(1000000, 0);
  expect(sniffAttachmentMime(oversized)).not.toBe('video/mp4');
  expect(sniffAttachmentMime(Buffer.from('not an actual video.mp4'))).not.toBe('video/mp4');
});
