import { afterEach, expect, it, vi } from 'vitest';
import {
  attachmentArtifact,
  createArtifactLoader,
  hostArtifactReader,
  sameOriginArtifactReader,
  type ArtifactReader,
} from '../src/artifacts';
import { createHostClient } from '../src/client';
import { FakeHost } from './fake-host';

const origin = 'https://studio.example.ts.net';
const route = `${origin}/botharness-device/api/botharness/attachment`;
const message = {
  id: 'message',
  at: '2026-11-23T12:00:00Z',
  author: { kind: 'bot', slug: 'atlas' },
} as const;
const ref = { fileId: 'file:original', name: 'report.md', mime: 'text/plain', size: 8 };
const key = JSON.stringify(['channel', message.id, ref.fileId]);

const file = (text: string, contentType = 'text/plain') => ({
  status: 200 as const,
  bytes: new TextEncoder().encode(text),
  contentType,
});

function fixture() {
  const host = new FakeHost();
  const connection = createHostClient({
    routes: [origin],
    credential: host.credential,
    carrier: host.carrier,
  });
  const artifact = attachmentArtifact('channel', message, ref);
  if (artifact === undefined) throw new Error('Missing Attachment fixture');
  const loader = createArtifactLoader(artifact, {
    read: hostArtifactReader(connection),
    maxBytes: 64,
  });
  return { host, loader };
}

afterEach(() => vi.unstubAllGlobals());

it('provides source metadata without a request, then reads current bytes on each open', async () => {
  const { host, loader } = fixture();
  host.attachments.set(key, file('# First version', 'text/markdown'));
  expect(loader.getSnapshot()).toEqual({
    kind: 'idle',
    metadata: {
      channelId: 'channel',
      messageId: message.id,
      sender: message.author,
      sentAt: message.at,
      name: ref.name,
      mediaType: ref.mime,
      size: ref.size,
    },
  });
  expect(host.requests).toEqual([]);
  const states: string[] = [];
  const unsubscribe = loader.subscribe(() => states.push(loader.getSnapshot().kind));
  await loader.load();
  expect(loader.getSnapshot()).toMatchObject({
    kind: 'ready',
    bytes: file('# First version').bytes,
    metadata: { mediaType: 'text/markdown', size: 15 },
  });
  loader.close();
  host.attachments.set(key, file('# Updated externally'));
  await loader.load();
  expect(loader.getSnapshot()).toMatchObject({
    kind: 'ready',
    bytes: file('# Updated externally').bytes,
    metadata: { mediaType: 'text/plain', size: 20 },
  });
  expect(states).toEqual(['loading', 'ready', 'idle', 'loading', 'ready']);
  expect(host.requests).toEqual(
    Array.from(
      { length: 2 },
      () => `GET ${route}?channelId=channel&messageId=message&fileId=file%3Aoriginal&maxBytes=64`,
    ),
  );
  unsubscribe();
});

it('fails on missing or expired bytes and revoked access without substituting another file', async () => {
  const { host, loader } = fixture();
  host.attachments.set(
    JSON.stringify(['channel', message.id, 'file:replacement']),
    file('different'),
  );
  await loader.load();
  expect(loader.getSnapshot()).toMatchObject({ kind: 'failure', reason: 'missing' });
  host.attachments.set(key, { status: 410 });
  await loader.retry();
  expect(loader.getSnapshot()).toMatchObject({ kind: 'failure', reason: 'expired' });
  host.attachments.set(key, file('# Restored'));
  host.revoked = true;
  await loader.retry();
  expect(loader.getSnapshot()).toMatchObject({ kind: 'failure', reason: 'unauthorized' });
  expect(host.requests).toHaveLength(3);
  expect(new Set(host.requests).size).toBe(1);
});

it('retries when the Host is reachable again and refuses a file grown past the cap', async () => {
  const { host, loader } = fixture();
  host.attachments.set(key, file('a'.repeat(65)));
  host.up = false;
  await loader.load();
  expect(loader.getSnapshot()).toMatchObject({ kind: 'failure', reason: 'unavailable' });
  host.up = true;
  await loader.retry();
  expect(loader.getSnapshot()).toMatchObject({ kind: 'failure', reason: 'over-limit' });
  host.attachments.set(key, file(''));
  await loader.retry();
  expect(loader.getSnapshot()).toMatchObject({ kind: 'ready', bytes: new Uint8Array(0) });
});

it('uses the exact legacy hash with its owning message and discards a completed read after close', async () => {
  const artifact = attachmentArtifact('channel', message, {
    hash: 'sha256:legacy',
    name: 'legacy.md',
    mime: 'text/plain',
    size: 5,
  });
  if (artifact === undefined) throw new Error('Missing legacy fixture');
  const responses: Array<(response: { status: number }) => void> = [];
  const read = vi.fn<ArtifactReader>(
    () =>
      new Promise((resolve) => {
        responses.push(resolve);
      }),
  );
  const loader = createArtifactLoader(artifact, { read, maxBytes: 64 });
  const pending = loader.load();
  expect(loader.getSnapshot().kind).toBe('loading');
  loader.close();
  const stale = read.mock.calls[0]?.[0];
  expect(stale?.signal.aborted).toBe(true);
  expect(stale?.path).toBe(
    '/api/botharness/attachment?channelId=channel&messageId=message&hash=sha256%3Alegacy&maxBytes=64',
  );
  const reopened = loader.load();
  expect(responses).toHaveLength(2);
  responses[0]?.({ status: 410 });
  await pending;
  expect(loader.getSnapshot().kind).toBe('loading');
  responses[1]?.({ status: 404 });
  await reopened;
  expect(loader.getSnapshot()).toMatchObject({ kind: 'failure', reason: 'missing' });
});

it('cuts off a same-origin response larger than the cap even without a declared length', async () => {
  const artifact = attachmentArtifact('channel', message, ref);
  if (artifact === undefined) throw new Error('Missing Attachment fixture');
  const fetcher = vi.fn(async (): Promise<Response> => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(file('a'.repeat(5)).bytes);
        controller.enqueue(file('b'.repeat(4)).bytes);
        controller.close();
      },
    });
    return new Response(body, { headers: { 'content-type': 'text/plain' } });
  });
  vi.stubGlobal('fetch', fetcher);
  const loader = createArtifactLoader(artifact, { read: sameOriginArtifactReader, maxBytes: 8 });
  await loader.load();
  expect(loader.getSnapshot()).toMatchObject({ kind: 'failure', reason: 'over-limit' });
  expect(fetcher).toHaveBeenCalledWith(
    './api/botharness/attachment?channelId=channel&messageId=message&fileId=file%3Aoriginal&maxBytes=8',
    expect.objectContaining({ credentials: 'same-origin', redirect: 'error', cache: 'no-store' }),
  );
});
