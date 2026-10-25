import { afterEach, expect, it } from 'vitest';
import { createHostClient, type HostClient } from '../src/host/client';
import { createChannelFiles, type ChannelFiles } from '../src/host/channel-files';
import { FakeHost } from './fake-host';

let client: HostClient | undefined;
let files: ChannelFiles | undefined;
afterEach(() => {
  files?.stop();
  client?.stop();
});

function open(host: FakeHost, timeoutMs = 200) {
  client = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: host.credential,
    carrier: host.carrier,
    backoff: () => 5,
    timeoutMs,
  });
  client.start();
  files = createChannelFiles({ host: client, channelId: 'files', pageSize: 2 });
  files.start();
  return files;
}

async function until(accept: () => boolean) {
  for (let i = 0; i < 300; i++) {
    if (accept()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out: ${JSON.stringify(files?.getSnapshot())}`);
}

function seed(host: FakeHost) {
  for (let i = 1; i <= 5; i++)
    host.channel('files').append(
      {
        id: `m${i}`,
        attachments: [
          {
            fileId: `file:00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
            name: 'report.pdf',
            mime: 'application/pdf',
            size: i,
          },
        ],
      },
      false,
    );
}

it('finds files beyond the current history window without downloading them or merging names', async () => {
  const host = new FakeHost();
  seed(host);
  const subject = open(host);
  await until(() => subject.getSnapshot().status === 'ready');
  expect(subject.getSnapshot().files.map((file) => file.messageId)).toEqual(['m5', 'm4']);
  await subject.loadOlder();
  await subject.loadOlder();
  const snapshot = subject.getSnapshot();
  expect(snapshot.files.map((file) => file.messageId)).toEqual(['m5', 'm4', 'm3', 'm2', 'm1']);
  expect(snapshot.hasOlder).toBe(false);
  expect(new URL(snapshot.files[4]!.attachment.source!.uri).searchParams.get('messageId')).toBe(
    'm1',
  );
  expect(host.requests.some((request) => request.includes('/attachment?'))).toBe(false);
});

it('retains visible files after a failed page and retries from the same boundary', async () => {
  const host = new FakeHost();
  seed(host);
  const subject = open(host);
  await until(() => subject.getSnapshot().status === 'ready');
  host.failing.add('channelJournalPage');
  await subject.loadOlder();
  expect(subject.getSnapshot().pageFailed).toBe(true);
  expect(subject.getSnapshot().files).toHaveLength(2);
  host.failing.delete('channelJournalPage');
  await subject.loadOlder();
  expect(subject.getSnapshot().files).toHaveLength(4);
  expect(subject.getSnapshot().pageFailed).toBe(false);
});

it('removes live redactions and prevents a pending history page from resurrecting them', async () => {
  const host = new FakeHost();
  seed(host);
  const subject = open(host);
  await until(() => subject.getSnapshot().status === 'ready');
  let finish: ((page: unknown) => void) | undefined;
  host.methods.set(
    'channelJournalPage',
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const request = subject.loadOlder();
  await until(() => finish !== undefined);
  host.push('botharness/followRoster', {
    type: 'purged',
    placements: [
      { channelId: 'files', messageId: 'm5', sourceEventId: 's5' },
      { channelId: 'files', messageId: 'm3', sourceEventId: 's3' },
      { channelId: 'another-channel', messageId: 'm4', sourceEventId: 'other' },
    ],
  });
  finish!(host.channel('files').page(5, 4, 2));
  await request;
  expect(subject.getSnapshot().files.map((file) => file.messageId)).toEqual(['m4', 'm2']);
});

it('does not accept a page that was requested before a reconnect baseline', async () => {
  const host = new FakeHost();
  seed(host);
  const subject = open(host);
  await until(() => subject.getSnapshot().status === 'ready');
  let finish: ((page: unknown) => void) | undefined;
  host.methods.set(
    'channelJournalPage',
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const request = subject.loadOlder();
  await until(() => finish !== undefined);
  host
    .channel('files')
    .emit({ type: 'opened', cursor: 5, page: host.channel('files').page(5, undefined, 2)! });
  finish!(host.channel('files').page(5, 4, 2));
  await request;
  expect(subject.getSnapshot().files.map((file) => file.messageId)).toEqual(['m5', 'm4']);
});

it('clears visible files on credential revocation', async () => {
  const host = new FakeHost();
  seed(host);
  const subject = open(host);
  await until(() => subject.getSnapshot().status === 'ready');
  host.revoke();
  await until(() => subject.getSnapshot().status === 'refused');
  expect(subject.getSnapshot().files).toEqual([]);
});

it('discards late pages after leaving the files screen', async () => {
  const host = new FakeHost();
  seed(host);
  const subject = open(host);
  await until(() => subject.getSnapshot().status === 'ready');
  let finish: ((page: unknown) => void) | undefined;
  host.methods.set(
    'channelJournalPage',
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const request = subject.loadOlder();
  await until(() => finish !== undefined);
  subject.stop();
  finish!(host.channel('files').page(5, 4, 2));
  await request;
  expect(subject.getSnapshot().files).toEqual([]);
  expect(host.channel('files').followerCount).toBe(0);
});

it('deduplicates exact references and reads across pages containing no attachments', async () => {
  const host = new FakeHost();
  seed(host);
  const channel = host.channel('files');
  const attachments = channel.messages[0]?.attachments;
  if (attachments === undefined) throw new Error('Seeded file attachment is missing');
  channel.append({ id: 'duplicate', attachments }, false);
  channel.append({ id: 'text-only-1' }, false);
  channel.append({ id: 'text-only-2' }, false);
  const subject = open(host);
  await until(() => subject.getSnapshot().status === 'ready');
  expect(subject.getSnapshot()).toMatchObject({ files: [], hasOlder: true });
  while (subject.getSnapshot().hasOlder) await subject.loadOlder();
  expect(subject.getSnapshot().files).toHaveLength(5);
  expect(subject.getSnapshot().files[0]?.messageId).toBe('duplicate');
  channel.append({
    id: 'image',
    attachments: [
      {
        fileId: 'file:00000000-0000-4000-8000-000000000006',
        name: 'photo.png',
        mime: 'image/png',
        size: 32,
      },
    ],
  });
  expect(subject.getSnapshot().files[0]).toMatchObject({
    messageId: 'image',
    attachment: { kind: 'image' },
  });
  expect(
    new URL(subject.getSnapshot().files[0]!.attachment.source!.uri).searchParams.get('fileId'),
  ).toBe('file:00000000-0000-4000-8000-000000000006');
});

it('shows a recoverable initial offline state and reads the current baseline after reconnect', async () => {
  const host = new FakeHost();
  seed(host);
  host.up = false;
  const subject = open(host);
  await until(() => subject.getSnapshot().status === 'interrupted');
  expect(subject.getSnapshot().files).toEqual([]);
  host.up = true;
  client!.retryNow();
  await until(() => subject.getSnapshot().status === 'ready');
  expect(subject.getSnapshot().files.map((file) => file.messageId)).toEqual(['m5', 'm4']);
});

it('retains loaded files throughout a same-source retry and applies refreshed redactions', async () => {
  const host = new FakeHost();
  seed(host);
  const subject = open(host);
  await until(() => subject.getSnapshot().status === 'ready');
  await subject.loadOlder();
  const ids = subject.getSnapshot().files.map((file) => file.messageId);
  subject.retry();
  expect(subject.getSnapshot()).toMatchObject({ status: 'opening', loadingOlder: false });
  expect(subject.getSnapshot().files.map((file) => file.messageId)).toEqual(ids);
  await until(() => subject.getSnapshot().status === 'ready');
  expect(subject.getSnapshot().files.map((file) => file.messageId)).toEqual(ids);
  host.push('botharness/followRoster', {
    type: 'purged',
    placements: [{ channelId: 'files', messageId: 'm3', sourceEventId: 's3' }],
  });
  expect(subject.getSnapshot().files.map((file) => file.messageId)).toEqual(['m5', 'm4', 'm2']);
});

it('settles paging when only the roster follower ends and allows another page after reattach', async () => {
  const host = new FakeHost();
  seed(host);
  const subject = open(host);
  await until(() => subject.getSnapshot().status === 'ready');
  let finish: ((page: unknown) => void) | undefined;
  host.methods.set(
    'channelJournalPage',
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = subject.loadOlder();
  await until(() => finish !== undefined);
  host.endFollower('botharness/followRoster');
  expect(subject.getSnapshot()).toMatchObject({ status: 'interrupted', loadingOlder: false });
  finish!(host.channel('files').page(5, 4, 2));
  await first;
  await until(() => subject.getSnapshot().status === 'ready');
  host.methods.delete('channelJournalPage');
  await subject.loadOlder();
  expect(subject.getSnapshot()).toMatchObject({ loadingOlder: false, pageFailed: false });
  expect(subject.getSnapshot().files).toHaveLength(4);
});

it('does not let a stale interrupted page clear a new page loading state', async () => {
  const host = new FakeHost();
  seed(host);
  const subject = open(host, 3000);
  await until(() => subject.getSnapshot().status === 'ready');
  const pending: Array<(page: unknown) => void> = [];
  host.methods.set('channelJournalPage', () => new Promise((resolve) => pending.push(resolve)));
  const old = subject.loadOlder();
  await until(() => pending.length === 1);
  host.endFollower('botharness/followRoster');
  await until(() => subject.getSnapshot().status === 'ready');
  const current = subject.loadOlder();
  await until(() => pending.length === 2);
  pending[0]!(host.channel('files').page(5, 4, 2));
  await old;
  expect(subject.getSnapshot().loadingOlder).toBe(true);
  expect(subject.getSnapshot().files).toHaveLength(2);
  pending[1]!(host.channel('files').page(5, 4, 2));
  await current;
  expect(subject.getSnapshot().loadingOlder).toBe(false);
  expect(subject.getSnapshot().files).toHaveLength(4);
});
