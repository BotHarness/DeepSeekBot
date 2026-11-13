import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAttachmentStore } from '../src/attachments/store.js';
import type { ChannelMessage } from '../src/channels/channel.js';
import { ChannelReplyTargetError, createChannelStore } from '../src/channels/store.js';

const roots: string[] = [];
let sequence = 0;

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'botharness-channels-'));
  roots.push(root);
  return root;
}

function tickingNow(): () => Date {
  let value = Date.parse('2026-09-19T00:00:00.000Z');
  return () => {
    value += 1000;
    return new Date(value);
  };
}

function message(body: string): ChannelMessage {
  sequence += 1;
  return {
    id: `msg-${sequence}`,
    at: new Date(Date.parse('2026-09-19T00:00:00.000Z') + sequence * 1000).toISOString(),
    author: { kind: 'human' },
    body,
  };
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

beforeEach(() => {
  sequence = 0;
});

describe('channel store', () => {
  it('creates a DM channel idempotently', () => {
    const root = createRoot();
    const store = createChannelStore({ rootDir: root, now: tickingNow() });

    const first = store.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    const second = store.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada Lovelace');

    expect(first).toMatchObject({
      id: 'dm-ada',
      type: 'dm',
      name: 'Ada',
      members: ['ada'],
      botSlug: 'ada',
    });
    expect(second?.id).toBe('dm-ada');
    expect(second?.name).toBe('Ada');
    expect(second?.createdAt).toBe(first?.createdAt);
    expect(
      JSON.parse(readFileSync(join(root, 'dm-ada', 'channel.json'), 'utf8')) as Record<
        string,
        unknown
      >,
    ).toMatchObject({ id: 'dm-ada', type: 'dm', name: 'Ada', members: ['ada'] });
  });

  it('renames group and DM channels without changing their stable ids or timestamps', () => {
    const store = createChannelStore({ rootDir: createRoot(), now: tickingNow() });
    const dm = store.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    const group = store.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Team', members: [] });

    expect(store.rename(OWNER_HUMAN_CONTEXT, dm?.id ?? '', '  Ada Lovelace  ')).toMatchObject({
      id: 'dm-ada',
      name: 'Ada Lovelace',
      createdAt: dm?.createdAt,
      updatedAt: dm?.updatedAt,
    });
    expect(store.rename(OWNER_HUMAN_CONTEXT, group.id, '  Research  ')?.name).toBe('Research');
    expect(store.rename(OWNER_HUMAN_CONTEXT, group.id, '   ')).toBeUndefined();
    expect(store.rename(OWNER_HUMAN_CONTEXT, 'missing', 'Name')).toBeUndefined();
  });

  it('falls back to the slug when the DM name is blank and rejects hostile slugs', () => {
    const store = createChannelStore({ rootDir: createRoot(), now: tickingNow() });

    expect(store.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', '   ')?.name).toBe('ada');
    expect(store.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'Ada', 'Ada')).toBeUndefined();
    expect(store.getOrCreateDm(OWNER_HUMAN_CONTEXT, '../evil', 'Evil')).toBeUndefined();
    expect(store.get('..')).toBeUndefined();
    expect(store.readMessages('..')).toEqual([]);
  });

  it('slugifies group names and suffixes collisions', () => {
    const store = createChannelStore({ rootDir: createRoot(), now: tickingNow() });

    const design = store.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Design Team',
      members: ['ada', 'bob'],
    });
    const designAgain = store.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'design   team',
      members: [],
    });
    const designThird = store.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'DESIGN-TEAM!',
      members: [],
    });
    const room = store.createGroup(OWNER_HUMAN_CONTEXT, { name: '设计', members: [] });
    const roomAgain = store.createGroup(OWNER_HUMAN_CONTEXT, { name: '!!!', members: [] });

    expect(design).toMatchObject({
      id: 'group-design-team',
      type: 'group',
      members: ['ada', 'bob'],
    });
    expect(designAgain.id).toBe('group-design-team-2');
    expect(designThird.id).toBe('group-design-team-3');
    expect(room.id).toBe('group-room');
    expect(roomAgain.id).toBe('group-room-2');
  });

  it('lists channels newest-updated first and moves one to the front on append', async () => {
    const store = createChannelStore({ rootDir: createRoot(), now: tickingNow() });
    store.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    store.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Team', members: [] });

    expect(store.list().map((channel) => channel.id)).toEqual(['group-team', 'dm-ada']);

    await store.appendMessage(OWNER_HUMAN_CONTEXT, 'dm-ada', message('hello'));

    expect(store.list().map((channel) => channel.id)).toEqual(['dm-ada', 'group-team']);
    expect(store.get('dm-ada')?.updatedAt).toBe('2026-09-19T00:00:03.000Z');
  });

  it('appends messages and pages them newest-first', async () => {
    const root = createRoot();
    const store = createChannelStore({ rootDir: root, now: tickingNow() });
    store.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    for (const body of ['m1', 'm2', 'm3', 'm4', 'm5']) {
      await store.appendMessage(OWNER_HUMAN_CONTEXT, 'dm-ada', message(body));
    }

    expect(store.readMessages('dm-ada').map((entry) => entry.body)).toEqual([
      'm5',
      'm4',
      'm3',
      'm2',
      'm1',
    ]);
    expect(store.readMessages('dm-ada', { limit: 2 }).map((entry) => entry.body)).toEqual([
      'm5',
      'm4',
    ]);
    expect(
      store.readMessages('dm-ada', { before: 'msg-4', limit: 2 }).map((entry) => entry.body),
    ).toEqual(['m3', 'm2']);
    expect(store.readMessages('dm-ada', { limit: 999 })).toHaveLength(5);
    expect(store.readMessages('dm-ada', { before: 'missing' })).toEqual([]);

    const lines = readFileSync(join(root, 'dm-ada', 'messages.ndjson'), 'utf8')
      .trim()
      .split('\n');
    expect(lines).toHaveLength(5);
    expect(JSON.parse(lines[4] ?? '{}')).toMatchObject({
      id: 'msg-5',
      body: 'm5',
      author: { kind: 'human' },
    });
    expect(store.latestMessage('dm-ada')?.body).toBe('m5');
    expect(store.latestMessage('missing')).toBeUndefined();
  });

  it('persists only a same-Channel reply ID and projects its summary in every read path', async () => {
    const root = createRoot();
    const store = createChannelStore({ rootDir: root, now: tickingNow() });
    const channel = store.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Team', members: [] });
    const original = message('Original   message');
    await store.appendMessage(OWNER_HUMAN_CONTEXT, channel.id, original);
    expect(store.hasMessage(channel.id, original.id)).toBe(true);
    expect(store.hasMessage(channel.id, 'missing')).toBe(false);
    const reply = {
      ...message('response'),
      replyTo: original.id,
      replyToPreview: { author: { kind: 'human' as const }, body: 'untrusted preview' },
    };
    const committed = await store.appendMessage(OWNER_HUMAN_CONTEXT, channel.id, reply);
    expect(committed).toMatchObject({
      replyTo: original.id,
      replyToPreview: { author: { kind: 'human' }, body: 'Original message' },
    });
    expect(store.readMessages(channel.id)[0]?.replyToPreview).toEqual(committed?.replyToPreview);
    expect(store.readTimeline(channel.id)?.entries.at(-1)?.replyToPreview).toEqual(
      committed?.replyToPreview,
    );
    expect(store.messagesAfter(channel.id, 1)?.[0]?.message.replyToPreview).toEqual(
      committed?.replyToPreview,
    );
    const lines = readFileSync(join(root, channel.id, 'messages.ndjson'), 'utf8')
      .trim()
      .split('\n');
    expect(JSON.parse(lines[1] ?? '{}')).toMatchObject({ replyTo: original.id });
    expect(lines[1]).not.toContain('replyToPreview');

    writeFileSync(join(root, channel.id, 'messages.ndjson'), (lines[1] ?? '') + '\n');
    const reopened = createChannelStore({ rootDir: root });
    expect(reopened.readTimeline(channel.id)?.entries[0]?.replyToPreview).toBeNull();
  });

  it('rejects a missing or cross-Channel reply before writing or notifying', async () => {
    const commits: string[] = [];
    const store = createChannelStore({
      rootDir: createRoot(),
      onCommitted: (commit) => commits.push(commit.message.id),
    });
    const dm = store.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    const group = store.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Team', members: [] });
    const groupMessage = message('group');
    await store.appendMessage(OWNER_HUMAN_CONTEXT, group.id, groupMessage);
    expect(dm).toBeDefined();
    if (dm === undefined) return;
    await expect(
      store.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        ...message('cross'),
        replyTo: groupMessage.id,
      }),
    ).rejects.toThrow(ChannelReplyTargetError);
    await expect(
      store.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        ...message('missing'),
        replyTo: 'unknown',
      }),
    ).rejects.toThrow(ChannelReplyTargetError);
    expect(store.revision(dm.id)).toBe(0);
    expect(store.readMessages(dm.id)).toEqual([]);
    expect(commits).toEqual([groupMessage.id]);
  });

  it('serializes concurrent appends to the same channel', async () => {
    const store = createChannelStore({ rootDir: createRoot(), now: tickingNow() });
    store.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.appendMessage(OWNER_HUMAN_CONTEXT, 'dm-ada', message(`m${index}`)),
      ),
    );

    const entries = store.readMessages('dm-ada');
    expect(entries).toHaveLength(20);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(20);
  });

  it('skips corrupt lines when reading', async () => {
    const root = createRoot();
    const store = createChannelStore({ rootDir: root, now: tickingNow() });
    store.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    await store.appendMessage(OWNER_HUMAN_CONTEXT, 'dm-ada', message('good'));
    appendFileSync(
      join(root, 'dm-ada', 'messages.ndjson'),
      'not json\n{"id":"broken"}\n\n',
      'utf8',
    );
    await store.appendMessage(OWNER_HUMAN_CONTEXT, 'dm-ada', message('good again'));
    appendFileSync(join(root, 'dm-ada', 'messages.ndjson'), 'not json\n', 'utf8');

    expect(store.readMessages('dm-ada').map((entry) => entry.body)).toEqual(['good again', 'good']);
    expect(store.latestMessage('dm-ada')?.body).toBe('good again');
  });

  it('tolerates a missing directory and unknown channels', async () => {
    const store = createChannelStore({
      rootDir: join(createRoot(), 'channels'),
      now: tickingNow(),
    });

    expect(store.list()).toEqual([]);
    expect(store.get('dm-ada')).toBeUndefined();
    expect(store.readMessages('dm-ada')).toEqual([]);
    expect(
      await store.appendMessage(OWNER_HUMAN_CONTEXT, 'dm-ada', message('nowhere')),
    ).toBeUndefined();
  });

  it('keeps one durable, monotonic read position per Channel across Host restarts', async () => {
    const root = createRoot();
    const store = createChannelStore({ rootDir: root, now: tickingNow() });
    store.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    const first = message('first');
    const second = message('second');
    const third = message('third');
    for (const entry of [first, second, third])
      await store.appendMessage(OWNER_HUMAN_CONTEXT, 'dm-ada', entry);

    expect(store.readPosition(OWNER_HUMAN_CONTEXT, 'dm-ada')).toBeUndefined();
    expect(await store.markRead(OWNER_HUMAN_CONTEXT, 'dm-ada', second.id)).toMatchObject({
      messageId: second.id,
      revision: 2,
    });
    const reopened = createChannelStore({ rootDir: root, now: tickingNow() });
    expect(reopened.readPosition(OWNER_HUMAN_CONTEXT, 'dm-ada')?.messageId).toBe(second.id);
    expect((await reopened.markRead(OWNER_HUMAN_CONTEXT, 'dm-ada', first.id))?.messageId).toBe(
      second.id,
    );
    expect((await reopened.markRead(OWNER_HUMAN_CONTEXT, 'dm-ada', third.id))?.revision).toBe(3);
    expect(await reopened.markRead(OWNER_HUMAN_CONTEXT, 'dm-ada', 'missing')).toBeUndefined();
    expect(await reopened.markRead(OWNER_HUMAN_CONTEXT, '../escape', third.id)).toBeUndefined();
    expect(reopened.readPosition(OWNER_HUMAN_CONTEXT, 'dm-ada')?.messageId).toBe(third.id);
  });

  it('ignores a corrupt or stale read position rather than opening at the wrong message', async () => {
    const root = createRoot();
    const store = createChannelStore({ rootDir: root });
    store.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    const entry = message('first');
    await store.appendMessage(OWNER_HUMAN_CONTEXT, 'dm-ada', entry);
    const path = join(root, 'dm-ada', 'read-position.json');
    writeFileSync(path, 'not json', 'utf8');
    expect(store.readPosition(OWNER_HUMAN_CONTEXT, 'dm-ada')).toBeUndefined();
    writeFileSync(path, JSON.stringify({ messageId: 'missing', revision: 1, readAt: entry.at }));
    expect(store.readPosition(OWNER_HUMAN_CONTEXT, 'dm-ada')).toBeUndefined();
  });

  it('accepts only refs present in the profile before durable append', async () => {
    const root = createRoot();
    const attachments = createAttachmentStore({ rootDir: join(root, 'attachments') });
    const ref = await attachments.upload({
      data: (async function* () {
        yield new TextEncoder().encode('hello');
      })(),
      name: 'note.txt',
    });
    const store = createChannelStore({ rootDir: join(root, 'channels'), attachments });
    store.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    const sent = await store.appendMessage(OWNER_HUMAN_CONTEXT, 'dm-ada', {
      ...message(''),
      attachments: [ref],
    });
    expect(sent?.attachments).toEqual([ref]);
    expect(store.readMessages('dm-ada')[0]?.attachments).toEqual([ref]);
    const forged = { ...ref, name: 'another.txt' };
    expect(() => store.assertAttachmentRefs([forged])).toThrow('does not belong');
    await expect(
      store.appendMessage(OWNER_HUMAN_CONTEXT, 'dm-ada', {
        ...message('bad'),
        attachments: [forged],
      }),
    ).rejects.toThrow('does not belong');
    expect(store.revision('dm-ada')).toBe(1);
    const orphan = await attachments.upload({
      data: (async function* () {
        yield new TextEncoder().encode('orphan');
      })(),
      name: 'orphan.txt',
    });
    expect(
      attachments.sweepUnreferenced(new Date(Date.now() + 10_000), () =>
        store.referencedAttachmentHashes(),
      ),
    ).toBe(1);
    expect(attachments.has(ref)).toBe(true);
    expect(attachments.has(orphan)).toBe(false);
    const other = createChannelStore({ rootDir: join(root, 'other-channels') });
    other.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    await expect(
      other.appendMessage(OWNER_HUMAN_CONTEXT, 'dm-ada', { ...message('bad'), attachments: [ref] }),
    ).rejects.toThrow('does not belong');
  });

  it('adds a media hint to reply previews of image, voice and file messages', async () => {
    const root = createRoot();
    const attachments = createAttachmentStore({ rootDir: join(root, 'attachments') });
    const upload = (name: string, bytes: Uint8Array) =>
      attachments.upload({
        data: (async function* () {
          yield bytes;
        })(),
        name,
      });
    const png = await upload(
      'photo.png',
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
    );
    const notes = await upload('notes.txt', new TextEncoder().encode('hello'));
    expect(png.mime).toBe('image/png');
    const store = createChannelStore({ rootDir: join(root, 'channels'), attachments });
    store.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    const photo = { ...message(''), attachments: [png] };
    const file = { ...message('see attached'), attachments: [notes] };
    const voice = {
      ...message('Spoken text'),
      author: { kind: 'bot' as const, slug: 'ada' },
      voice: { state: 'ready' as const, attachment: 'voice-file', durationMs: 7000 },
    };
    const text = message('just text');
    for (const target of [photo, file, voice, text])
      await store.appendMessage(OWNER_HUMAN_CONTEXT, 'dm-ada', target);
    const replies = [photo, file, voice, text].map((target) => ({
      ...message('re'),
      replyTo: target.id,
    }));
    for (const reply of replies) await store.appendMessage(OWNER_HUMAN_CONTEXT, 'dm-ada', reply);
    const previews = store
      .readMessages('dm-ada', { limit: 4 })
      .toReversed()
      .map((entry) => entry.replyToPreview);
    expect(previews).toEqual([
      { author: { kind: 'human' }, body: '', media: { kind: 'image', count: 1, thumbnail: png } },
      {
        author: { kind: 'human' },
        body: 'see attached',
        media: { kind: 'file', name: 'notes.txt', count: 1 },
      },
      {
        author: { kind: 'bot', slug: 'ada' },
        body: 'Spoken text',
        media: { kind: 'voice', durationMs: 7000 },
      },
      { author: { kind: 'human' }, body: 'just text' },
    ]);
  });

  it('skips directories whose channel.json is corrupt or mismatched', () => {
    const root = createRoot();
    mkdirSync(join(root, 'stale'), { recursive: true });
    writeFileSync(join(root, 'stale', 'channel.json'), '{"id":"other"}', 'utf8');
    mkdirSync(join(root, 'notes'), { recursive: true });
    writeFileSync(join(root, 'notes', 'channel.json'), 'not json\n', 'utf8');
    writeFileSync(join(root, 'loose.txt'), 'not a directory\n', 'utf8');
    const store = createChannelStore({ rootDir: root, now: tickingNow() });

    expect(store.list()).toEqual([]);
  });
});
