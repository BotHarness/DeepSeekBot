import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ConversationSnapshot } from '@botharness/host-client/conversation';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';

import { DM, ROUTE, SLUG, ids, open, seed, stopConversation, until } from './conversation-fixtures';

afterEach(stopConversation);

describe('DM conversation', () => {
  it('sends with a phone message id: pending, then sent, then the journal entry', async () => {
    const host = new FakeHost();
    seed(host.channel(DM), 2);
    let releaseSend: () => void = () => {};
    host.methods.set(
      'channelSend',
      (args) =>
        new Promise((resolve) => {
          releaseSend = () => {
            const channel = host.channel(DM);
            channel.append({ id: String(args['messageId']), body: String(args['body']) }, false);
            resolve({ message: channel.messages.at(-1) });
          };
        }),
    );
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    const id = target.send('mobile tracer DM 7f3a');
    expect(target.getSnapshot().messages.at(-1)).toMatchObject({
      id,
      body: 'mobile tracer DM 7f3a',
      delivery: 'pending',
    });
    await until(target, () => host.calls.some((call) => call.method === 'channelSend'));
    releaseSend();
    const sent = await until(target, (s) => s.messages.at(-1)?.delivery === 'committed');
    expect(sent.messages.at(-1)?.revision).toBeUndefined();
    host.channel(DM).emit({
      type: 'entry',
      entry: { channelId: DM, message: host.channel(DM).messages.at(-1)!, revision: 3 },
    });
    const joined = await until(target, (s) => s.messages.at(-1)?.revision === 3);
    expect(ids(joined).filter((value) => value === id)).toHaveLength(1);
    expect(host.calls.find((call) => call.method === 'channelSend')?.args).toEqual({
      channelId: DM,
      body: 'mobile tracer DM 7f3a',
      messageId: id,
    });
  });

  it('sends a reply with its target and shows the quoted message before and after the Host commits it', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 2);
    channel.append(
      {
        id: 'human-3',
        body: 'which file?',
        author: { kind: 'human' },
        replyTo: 'bot-2',
        replyToPreview: { author: { kind: 'bot', slug: SLUG }, body: 'answer 2' },
      },
      false,
    );
    const target = open(host);
    const live = await until(target, (s) => s.status === 'live');
    expect(live.messages.at(-1)).toMatchObject({
      replyTo: 'bot-2',
      replyPreview: { author: { kind: 'bot', slug: SLUG }, body: 'answer 2' },
    });
    expect(live.messages[0]).not.toHaveProperty('replyTo');
    const id = target.send('this one', [], { replyTo: 'human-1' });
    expect(target.getSnapshot().messages.at(-1)).toMatchObject({
      id,
      replyTo: 'human-1',
      replyPreview: { author: { kind: 'human' }, body: 'question 1' },
    });
    await until(target, () => host.calls.some((call) => call.method === 'channelSend'));
    expect(host.calls.find((call) => call.method === 'channelSend')?.args).toMatchObject({
      channelId: DM,
      body: 'this one',
      messageId: id,
      replyTo: 'human-1',
    });
  });

  it('keeps the media hint of a quoted voice, image or file message', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    const photo = {
      fileId: 'file:00000000-0000-4000-8000-000000000001',
      name: 'photo.jpg',
      mime: 'image/jpeg',
      size: 10,
      thumbhash: 'abc',
    };
    channel.append(
      {
        id: 'bot-voice',
        author: { kind: 'bot', slug: SLUG },
        body: 'Spoken',
        voice: { state: 'ready', attachment: 'voice', durationMs: 7000 },
      },
      false,
    );
    channel.append({ id: 'human-photo', attachments: [photo, photo] }, false);
    channel.append(
      {
        id: 'human-file',
        body: 'report',
        attachments: [{ ...photo, name: 'Q3.pdf', mime: 'application/pdf' }],
      },
      false,
    );
    channel.append(
      {
        id: 'human-reply',
        body: 'that one',
        replyTo: 'bot-voice',
        replyToPreview: {
          author: { kind: 'bot', slug: SLUG },
          body: 'Spoken',
          media: { kind: 'voice', durationMs: 7000 },
        },
      },
      false,
    );
    const target = open(host);
    const live = await until(target, (s) => s.status === 'live');
    expect(live.messages.at(-1)?.replyPreview?.media).toEqual({ kind: 'voice', durationMs: 7000 });
    expect(live.messages[0]?.voice).toEqual({ state: 'ready', durationMs: 7000 });
    expect(live.messages.at(-1)).not.toHaveProperty('replyThumbnail');
    const quoted = (replyTo: string) => {
      target.send('re', [], { replyTo });
      return target.getSnapshot().messages.at(-1);
    };
    const thumbnail = quoted('human-photo')?.replyThumbnail;
    expect(thumbnail?.thumbhash).toBe('abc');
    expect(thumbnail?.source.uri).toContain('messageId=human-photo');
    expect(thumbnail?.source.uri).toContain(encodeURIComponent(photo.fileId));
    expect(quoted('human-file')).not.toHaveProperty('replyThumbnail');
    const pending = (replyTo: string) => {
      target.send('re', [], { replyTo });
      return target.getSnapshot().messages.at(-1)?.replyPreview;
    };
    expect(pending('bot-voice')).toEqual({
      author: { kind: 'bot', slug: SLUG },
      body: 'Spoken',
      media: { kind: 'voice', durationMs: 7000 },
    });
    expect(pending('human-photo')).toEqual({
      author: { kind: 'human' },
      body: '',
      media: { kind: 'image', count: 2, thumbnail: photo },
    });
    expect(pending('human-file')?.media).toEqual({ kind: 'file', name: 'Q3.pdf', count: 1 });
  });

  it('shows reactions from the journal and follows reaction changes live', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 2);
    channel.messages[0]!.reactions = [{ emoji: '👍', actors: [{ kind: 'bot', id: SLUG }] }];
    const target = open(host);
    const live = await until(target, (s) => s.status === 'live');
    expect(live.messages[0]?.reactions).toEqual([
      { emoji: '👍', actors: [{ kind: 'bot', id: SLUG }] },
    ]);
    expect(live.messages[1]).not.toHaveProperty('reactions');
    channel.react('bot-2', [{ emoji: '👀', actors: [{ kind: 'bot', id: SLUG }] }]);
    const seen = await until(target, (s) => s.messages[1]?.reactions !== undefined);
    expect(seen.messages[1]?.reactions?.[0]?.emoji).toBe('👀');
    channel.react('human-1', []);
    const cleared = await until(target, (s) => s.messages[0]?.reactions === undefined);
    expect(cleared.messages[1]?.reactions).toHaveLength(1);
  });

  it('reacts at once, then settles on what the Host stored', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 2);
    channel.messages[1]!.reactions = [{ emoji: '👍', actors: [{ kind: 'bot', id: SLUG }] }];
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    const done = target.react('bot-2', '👍', true);
    expect(target.getSnapshot().messages[1]?.reactions).toEqual([
      {
        emoji: '👍',
        actors: [
          { kind: 'bot', id: SLUG },
          { kind: 'human', id: 'local-human' },
        ],
      },
    ]);
    await done;
    expect(host.calls.find((call) => call.method === 'channelReact')?.args).toEqual({
      channelId: DM,
      messageId: 'bot-2',
      emoji: '👍',
      active: true,
    });
    await target.react('bot-2', '👍', false);
    expect(target.getSnapshot().messages[1]?.reactions).toEqual([
      { emoji: '👍', actors: [{ kind: 'bot', id: SLUG }] },
    ]);
    expect(channel.messages[1]?.reactions).toEqual([
      { emoji: '👍', actors: [{ kind: 'bot', id: SLUG }] },
    ]);
  });

  it('puts a reaction back when the Host refuses it', async () => {
    const host = new FakeHost();
    seed(host.channel(DM), 2);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    host.failing.add('channelReact');
    const done = target.react('bot-2', '🎉', true);
    expect(target.getSnapshot().messages[1]?.reactions?.[0]?.emoji).toBe('🎉');
    await expect(done).rejects.toThrow();
    expect(target.getSnapshot().messages[1]).not.toHaveProperty('reactions');
  });

  it('marks a send failed and retries with the same id, so the Host commits it once', async () => {
    const host = new FakeHost();
    host.channel(DM);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    host.failing.add('channelSend');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000);
    const id = target.send('retry me');
    expect(target.getSnapshot().messages.at(-1)?.attemptStartedAt).toBe(1_000);
    const sentAt = target.getSnapshot().messages.at(-1)?.at;
    const failed = await until(target, (s) => s.messages.at(-1)?.delivery === 'failed');
    expect(failed.messages.at(-1)?.error).toBeTruthy();
    host.failing.delete('channelSend');
    vi.setSystemTime(9_000);
    target.retry(id);
    expect(target.getSnapshot().messages.at(-1)?.attemptStartedAt).toBe(9_000);
    expect(target.getSnapshot().messages.at(-1)?.at).toBe(sentAt);
    expect(target.getSnapshot().messages.at(-1)?.delivery).toBe('pending');
    await until(target, (s) => s.messages.at(-1)?.revision === 1);
    target.retry(id);
    await host.carrier.request(`${ROUTE}/api/botharness/channelSend`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'replay',
        method: 'botharness/channelSend',
        payload: { args: { channelId: DM, body: 'retry me', messageId: id } },
      }),
      signal: new AbortController().signal,
    });
    expect(host.channel(DM).messages.filter((message) => message.id === id)).toHaveLength(1);
    expect(ids(target.getSnapshot()).filter((value) => value === id)).toHaveLength(1);
  });

  it('uploads attachments before sending and keeps finished uploads across a retry', async () => {
    const host = new FakeHost();
    host.channel(DM);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    let reads = 0;
    const file = (name: string, text: string) => ({
      name,
      read: async () => {
        reads += 1;
        return new Blob([text]);
      },
    });
    host.failing.add('channelSend');
    const id = target.send('two files', [file('a.txt', 'alpha'), file('b.txt', 'beta')]);
    expect(target.getSnapshot().messages.at(-1)?.attachments).toEqual([
      { key: `${id}:0`, kind: 'file', name: 'a.txt', local: false },
      { key: `${id}:1`, kind: 'file', name: 'b.txt', local: false },
    ]);
    await until(target, (s) => s.messages.at(-1)?.delivery === 'failed');
    expect(host.uploads).toEqual([
      { name: 'a.txt', type: 'application/octet-stream', text: 'alpha' },
      { name: 'b.txt', type: 'application/octet-stream', text: 'beta' },
    ]);
    host.failing.delete('channelSend');
    target.retry(id);
    await until(target, (s) => s.messages.at(-1)?.delivery === 'committed');
    expect(reads).toBe(2);
    expect(host.uploads).toHaveLength(2);
    const sent = host.calls.filter((call) => call.method === 'channelSend').at(-1)?.args;
    expect(sent?.['attachments']).toEqual([
      expect.objectContaining({ name: 'a.txt', size: 5 }),
      expect.objectContaining({ name: 'b.txt', size: 4 }),
    ]);
  });

  it('uploads a typed photo as octet-stream so the Host accepts it', async () => {
    const host = new FakeHost();
    host.channel(DM);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    const photo = async () => new Blob(['png'], { type: 'image/png' });
    const id = target.send('', [{ name: 'IMG_0001.PNG', kind: 'image', read: photo }]);
    const sent = (s: ConversationSnapshot) => s.messages.find((message) => message.id === id);
    await until(target, (s) => sent(s)?.delivery !== 'pending');
    expect(sent(target.getSnapshot())?.delivery).toBe('committed');
    expect(host.uploads).toEqual([
      { name: 'IMG_0001.PNG', type: 'application/octet-stream', text: 'png' },
    ]);
    expect(host.calls.filter((call) => call.method === 'channelSend')).toHaveLength(1);
  });

  it('shows picked files at once and keeps their local copies after the Host commits them', async () => {
    const host = new FakeHost();
    host.channel(DM);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    const id = target.send('', [
      {
        name: 'cat.jpg',
        kind: 'image',
        uri: 'file:///cache/cat.jpg',
        read: async () => new Blob(['jpeg']),
      },
    ]);
    expect(target.getSnapshot().messages.at(-1)?.attachments).toEqual([
      {
        key: `${id}:0`,
        kind: 'image',
        name: 'cat.jpg',
        source: { uri: 'file:///cache/cat.jpg', headers: {} },
        local: true,
      },
    ]);
    const committed = await until(target, (s) => s.messages.at(-1)?.revision === 1);
    expect(committed.messages.at(-1)?.attachments[0]).toMatchObject({
      name: 'cat.jpg',
      size: 4,
      source: { uri: 'file:///cache/cat.jpg', headers: {} },
      local: true,
    });
  });

  it('loads committed attachments and bridged IM media through the device gateway', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    channel.append(
      {
        id: 'bot-1',
        author: { kind: 'bot', slug: SLUG },
        body: 'here you go',
        attachments: [
          {
            fileId: 'file:00000000-0000-4000-8000-000000000001',
            name: 'chart.png',
            mime: 'image/png',
            size: 2048,
          },
          {
            hash: `sha256:${'a'.repeat(64)}`,
            name: 'report.pdf',
            mime: 'application/pdf',
            size: 3_500_000,
          },
        ],
      },
      false,
    );
    channel.append(
      {
        id: 'bridged-1',
        author: { kind: 'bridged', source: 'lark' },
        body: '',
        bridgeMedia: { items: [{ id: 'img-1', kind: 'image', name: 'photo.jpg' }] },
        bridgeOrigin: { sourceEventId: 'evt-9' } as never,
      },
      false,
    );
    const target = open(host);
    const live = await until(target, (s) => s.messages.length === 2);
    const headers = { authorization: `Device ${host.credential}` };
    const gateway = `${ROUTE}/botharness-device/api/botharness/attachment?`;
    expect(live.messages[0]?.attachments).toEqual([
      {
        key: 'bot-1:0',
        identity: 'file:00000000-0000-4000-8000-000000000001',
        kind: 'image',
        name: 'chart.png',
        mime: 'image/png',
        size: 2048,
        source: {
          uri: `${gateway}${new URLSearchParams({ channelId: DM, messageId: 'bot-1', fileId: 'file:00000000-0000-4000-8000-000000000001' })}`,
          headers,
        },
        local: false,
      },
      {
        key: 'bot-1:1',
        identity: `sha256:${'a'.repeat(64)}`,
        kind: 'file',
        name: 'report.pdf',
        mime: 'application/pdf',
        size: 3_500_000,
        source: {
          uri: `${gateway}${new URLSearchParams({ hash: `sha256:${'a'.repeat(64)}`, name: 'report.pdf', channelId: DM, messageId: 'bot-1' })}`,
          headers,
        },
        local: false,
      },
    ]);
    expect(live.messages[1]?.attachments).toEqual([
      {
        key: 'bridged-1:bridge:img-1',
        identity: 'evt-9:bridge:img-1',
        kind: 'image',
        name: 'photo.jpg',
        source: {
          uri: `${gateway}${new URLSearchParams({ channelId: DM, sourceEventId: 'evt-9', attachmentId: 'img-1' })}`,
          headers,
        },
        local: false,
      },
    ]);
  });

  it('keeps bridged video as an explicit original-file action and does not expose its cover as an eager image', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    channel.append(
      {
        id: 'native-video',
        author: { kind: 'bridged', source: 'lark' },
        body: '',
        bridgeMedia: {
          video: { attachmentId: 'clip', posterAttachmentId: 'cover' },
          items: [
            { id: 'clip', kind: 'video', name: 'clip.mp4' },
            { id: 'cover', kind: 'image', name: 'cover' },
          ],
        },
        bridgeOrigin: { sourceEventId: 'video-event' } as never,
      },
      false,
    );
    const target = open(host);
    const live = await until(target, (s) => s.messages.length === 1);
    expect(live.messages[0]?.attachments).toHaveLength(1);
    expect(live.messages[0]?.attachments[0]).toMatchObject({
      kind: 'file',
      name: 'clip.mp4',
      local: false,
      source: { uri: expect.stringContaining('attachmentId=clip') },
    });
  });

  it('shows cleared media as a cleared file card without a download source', async () => {
    const host = new FakeHost();
    host.channel(DM).append(
      {
        id: 'old-1',
        author: { kind: 'human' },
        body: 'from January',
        clearedAttachments: [
          {
            name: 'beach.png',
            mime: 'image/png',
            size: 4096,
            clearedAt: '2026-10-20T00:00:00.000Z',
          },
        ],
      },
      false,
    );
    const target = open(host);
    const live = await until(target, (s) => s.messages.length === 1);
    expect(live.messages[0]?.body).toBe('from January');
    expect(live.messages[0]?.attachments).toEqual([
      {
        key: 'old-1:cleared:0',
        kind: 'file',
        name: 'beach.png',
        mime: 'image/png',
        size: 4096,
        local: false,
        cleared: true,
      },
    ]);
  });
});

it('observes activation only after an accepted foreground send and a new committed Bot entry', async () => {
  const host = new FakeHost();
  const channel = host.channel(DM);
  seed(channel, 2);
  const accepted = vi.fn(() => true);
  const observed = vi.fn();
  const target = open(host, { telemetry: { send: () => ({ accepted, observed }) } });
  target.setForeground?.(true);
  await until(target, (s) => s.status === 'live');
  expect(observed).not.toHaveBeenCalled();
  host.failing.add('channelSend');
  const id = target.send('SENTINEL chat');
  expect(accepted).not.toHaveBeenCalled();
  await until(target, (s) => s.messages.at(-1)?.delivery === 'failed');
  expect(accepted).not.toHaveBeenCalled();
  host.failing.delete('channelSend');
  target.retry(id);
  await until(target, (s) => s.messages.some((m) => m.id === id && m.revision !== undefined));
  expect(accepted).toHaveBeenCalledTimes(1);
  channel.emit({
    type: 'entry',
    entry: { channelId: DM, revision: 2, message: channel.messages[1]! },
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(observed).not.toHaveBeenCalled();
  channel.append({ id: 'new-bot', body: 'SENTINEL reply', author: { kind: 'bot', slug: SLUG } });
  await until(target, (s) => s.messages.at(-1)?.id === 'new-bot');
  expect(observed).toHaveBeenCalledTimes(1);
  target.setForeground?.(false);
  channel.append({ id: 'hidden-bot', author: { kind: 'bot', slug: SLUG } });
  await until(target, (s) => s.messages.at(-1)?.id === 'hidden-bot');
  expect(observed).toHaveBeenCalledTimes(1);
});

it('records Host acceptance after leaving the conversation without observing hidden Bot entries', async () => {
  const host = new FakeHost();
  const channel = host.channel(DM);
  seed(channel, 2);
  const accepted = vi.fn(() => true);
  const observed = vi.fn();
  const target = open(host, { telemetry: { send: () => ({ accepted, observed }) } });
  target.setForeground?.(true);
  await until(target, (s) => s.status === 'live');
  const id = target.send('accepted after navigation');
  target.setForeground?.(false);
  await until(target, (s) => s.messages.some((m) => m.id === id && m.revision !== undefined));
  expect(accepted).toHaveBeenCalledTimes(1);
  channel.append({ id: 'hidden-after-acceptance', author: { kind: 'bot', slug: SLUG } });
  await until(target, (s) => s.messages.at(-1)?.id === 'hidden-after-acceptance');
  expect(observed).not.toHaveBeenCalled();
});

describe('message deliveries', () => {
  it('shows Inbox admissions on a Human message and follows their updates', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    channel.append(
      {
        id: 'human-1',
        body: '@Probe check this',
        author: { kind: 'human' },
        deliveries: [{ botSlug: SLUG, state: 'pending' }],
      },
      false,
    );
    const target = open(host);
    const live = await until(target, (s) => s.status === 'live' && s.messages.length === 1);
    expect(live.messages[0]?.deliveries).toEqual([{ botSlug: SLUG, state: 'pending' }]);
    const admission = (state: 'handled' | 'ignored') =>
      channel.emit({
        type: 'notification',
        notification: {
          kind: 'admission',
          channelId: DM,
          messageId: 'human-1',
          deliveries: [{ botSlug: SLUG, state }],
        },
      });
    admission('ignored');
    const ignored = await until(target, (s) => s.messages[0]?.deliveries?.[0]?.state === 'ignored');
    admission('ignored');
    admission('handled');
    const handled = await until(target, (s) => s.messages[0]?.deliveries?.[0]?.state === 'handled');
    expect(handled.messages[0]).not.toBe(ignored.messages[0]);
    expect(handled.messages[0]?.body).toBe('@Probe check this');
  });
});
