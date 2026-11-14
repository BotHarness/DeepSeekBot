import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createChannelStore } from '../src/channels/store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CHANNEL_ATTACHMENT_PATH, createAttachmentHttp } from '../src/attachments/http.js';
import { createAttachmentStore } from '../src/attachments/store.js';
import type { ChannelAttachmentRef } from '../src/attachments/ref.js';
import { MessagingError } from '../src/messaging/provider.js';

const roots: string[] = [];
function setup(maxBytes = 1024) {
  const rootDir = mkdtempSync(join(tmpdir(), 'botharness-attachment-http-'));
  roots.push(rootDir);
  const store = createAttachmentStore({ rootDir, maxBytes });
  const channels = createChannelStore({ rootDir: join(rootDir, 'channels'), attachments: store });
  const channel = channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Files', members: [] });
  const http = createAttachmentHttp(store, channels);
  return async (request: Request) => {
    const response = await http(request);
    if (request.method === 'POST' && response.ok) {
      const { attachment } = (await response.clone().json()) as {
        attachment: ChannelAttachmentRef;
      };
      await channels.appendMessage(OWNER_HUMAN_CONTEXT, channel.id, {
        id: attachment.fileId!,
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '',
        attachments: [attachment],
      });
    }
    return response;
  };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const url = (query = '') => `http://local${CHANNEL_ATTACHMENT_PATH}${query}`;

describe('exact attachment Fetch route', () => {
  it('streams a PNG upload and inline download with server-sniffed type', async () => {
    const handle = setup();
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 4));
        controller.enqueue(bytes.subarray(4));
        controller.close();
      },
    });
    const upload = await handle(
      new Request(url('?name=%2Fprivate%2Fcat.png'), {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: stream,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' }),
    );
    expect(upload.status).toBe(200);
    const ref = ((await upload.json()) as { attachment: ChannelAttachmentRef }).attachment;
    expect(ref).toMatchObject({ name: 'cat.png', mime: 'image/png', size: bytes.length });
    const download = await handle(
      new Request(
        url(
          `?fileId=${encodeURIComponent(ref.fileId!)}&channelId=group-files&messageId=${encodeURIComponent(ref.fileId!)}`,
        ),
      ),
    );
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('image/png');
    expect(download.headers.get('content-disposition')).toMatch(/^inline;/u);
    expect(download.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
  });

  it('forces non-images to download and rejects spoofing and oversize', async () => {
    const handle = setup(8);
    expect(
      (
        await handle(
          new Request(url(), {
            method: 'POST',
            headers: { 'content-type': 'image/png' },
            body: 'fake',
          }),
        )
      ).status,
    ).toBe(415);
    const oversized = await handle(
      new Request(url(), {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: '123456789',
      }),
    );
    expect(oversized.status).toBe(413);
    const upload = await handle(
      new Request(url('?name=notes.pdf'), {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: '%PDF-1.7',
      }),
    );
    const ref = ((await upload.json()) as { attachment: ChannelAttachmentRef }).attachment;
    const download = await handle(
      new Request(
        url(
          `?fileId=${encodeURIComponent(ref.fileId!)}&channelId=group-files&messageId=${encodeURIComponent(ref.fileId!)}`,
        ),
      ),
    );
    expect(download.headers.get('content-type')).toBe('application/pdf');
    expect(download.headers.get('content-disposition')).toMatch(/^attachment;/u);
    expect((await handle(new Request(url('?hash=bad')))).status).toBe(400);
    expect((await handle(new Request(url()))).status).toBe(400);
    expect((await handle(new Request(url(), { method: 'DELETE' }))).status).toBe(405);
  });
});

it('downloads a trusted external source through its callback and rejects mixed selectors before acquiring bytes', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'botharness-external-http-'));
  roots.push(rootDir);
  const store = createAttachmentStore({ rootDir });
  const ref = await store.upload({
    name: 'source.zip',
    data: (async function* () {
      yield Buffer.from('ZIP');
    })(),
  });
  const load = vi.fn(async () => store.download(ref.fileId!));
  const handle = createAttachmentHttp(store, undefined, load);
  const query = '?slug=ada&sourceEventId=source&attachmentId=attachment';
  const request = new Request(url(query));
  const response = await handle(request);
  expect(load).toHaveBeenCalledWith({
    slug: 'ada',
    sourceEventId: 'source',
    attachmentId: 'attachment',
    signal: request.signal,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-disposition')).toMatch(/^attachment;/u);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(await response.text()).toBe('ZIP');
  expect((await handle(new Request(url(query + '&fileId=' + ref.fileId!)))).status).toBe(400);
  expect((await handle(new Request(url('?slug=ada&sourceEventId=source')))).status).toBe(400);
  expect(load).toHaveBeenCalledTimes(1);
});

it('refuses an unavailable external source without returning its provider error or bytes', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'botharness-external-http-'));
  roots.push(rootDir);
  const handle = createAttachmentHttp(createAttachmentStore({ rootDir }), undefined, async () => {
    throw new MessagingError('sensitive-provider-detail');
  });
  const response = await handle(
    new Request(url('?slug=ada&sourceEventId=source&attachmentId=attachment')),
  );
  expect(response.status).toBe(403);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({
    error: { code: 'source-unavailable', message: 'Attachment source is unavailable' },
  });
});

it('selects playback explicitly and reports bounded codec refusal without leaking provider detail', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'botharness-audio-http-'));
  roots.push(rootDir);
  const load = vi.fn(async (_input: { representation?: 'playback' }) => {
    const error = new MessagingError('audio-codec-unsupported');
    error.message = 'private media ticket';
    throw error;
  });
  const handle = createAttachmentHttp(createAttachmentStore({ rootDir }), undefined, load);
  const query = '?slug=ada&sourceEventId=voice&attachmentId=original&representation=playback';
  const response = await handle(new Request(url(query)));
  expect(load.mock.calls[0]?.[0]).toMatchObject({ representation: 'playback' });
  expect(response.status).toBe(422);
  expect(await response.text()).not.toContain('private media ticket');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await handle(new Request(url(query.replace('playback', 'arbitrary'))))).status).toBe(400);
  expect(load).toHaveBeenCalledTimes(1);
});
