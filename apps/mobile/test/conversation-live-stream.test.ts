import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Conversation } from '@botharness/host-client/conversation';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';

import {
  DM,
  SLUG,
  contiguous,
  ids,
  open,
  revisions,
  seed,
  stopConversation,
  until,
} from './conversation-fixtures';

afterEach(stopConversation);

describe('DM conversation', () => {
  it('streams a Bot draft live and replaces it with the committed reply', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 1);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    const draft = {
      channelId: DM,
      draftId: 'draft-1',
      attemptId: 'attempt-1',
      botSlug: SLUG,
      revision: 1,
    };
    channel.emit({
      type: 'notification',
      notification: { kind: 'draft', draft: { ...draft, body: 'Hel' } },
    });
    await until(target, (s) => s.drafts[0]?.body === 'Hel');
    channel.emit({
      type: 'notification',
      notification: { kind: 'draft', draft: { ...draft, body: 'Hello **there**' } },
    });
    await until(target, (s) => s.drafts[0]?.body === 'Hello **there**');
    channel.append({
      id: 'bot-reply',
      body: 'Hello **there**',
      author: { kind: 'bot', slug: SLUG },
    });
    const done = await until(target, (s) => s.messages.at(-1)?.id === 'bot-reply');
    expect(done.drafts).toEqual([]);
    expect(done.messages.at(-1)).toMatchObject({ author: 'bot', delivery: 'committed' });
  });

  it('coalesces streamed draft bodies into few snapshots and keeps the messages array', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 2);
    const target = open(host, { draftDelayMs: 200 });
    const live = await until(target, (s) => s.status === 'live' && s.messages.length === 2);
    const bodies: string[] = [];
    const messageArrays = new Set<unknown>();
    target.subscribe(() => {
      const snapshot = target.getSnapshot();
      bodies.push(snapshot.drafts[0]?.body ?? '');
      messageArrays.add(snapshot.messages);
    });
    const draft = { channelId: DM, draftId: 'draft-1', attemptId: 'attempt-1', botSlug: SLUG };
    const words = Array.from({ length: 20 }, (_, index) => `word${index}`);
    words.forEach((_, index) =>
      channel.emit({
        type: 'notification',
        notification: {
          kind: 'draft',
          draft: { ...draft, revision: index + 1, body: words.slice(0, index + 1).join(' ') },
        },
      }),
    );
    const final = words.join(' ');
    await until(target, (s) => s.drafts[0]?.body === final);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(bodies.length).toBeLessThan(5);
    expect(bodies.filter((body) => body === final)).toHaveLength(1);
    expect([...messageArrays]).toEqual([live.messages]);
    expect(messageArrays.has(live.messages)).toBe(true);
  });

  it('keeps the timeline identity during body appends while publishing live draft text', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 2);
    const target = open(host, { draftDelayMs: 0 });
    await until(target, (s) => s.status === 'live');
    const draft = { channelId: DM, draftId: 'draft-1', attemptId: 'attempt-1', botSlug: SLUG };
    channel.emit({
      type: 'notification',
      notification: { kind: 'draft', draft: { ...draft, revision: 1, body: 'First' } },
    });
    await until(target, (s) => s.drafts[0]?.body === 'First');
    const before = target.getTimelineSnapshot();
    channel.emit({
      type: 'notification',
      notification: {
        kind: 'draft-append',
        append: { ...draft, base: 1, revision: 2, offset: 5, append: ' second' },
      },
    });
    await until(target, (s) => s.drafts[0]?.body === 'First second');
    expect(target.getTimelineSnapshot()).toBe(before);
    expect(before.drafts).toEqual([{ draftId: 'draft-1', botSlug: SLUG }]);
    channel.append({ id: 'settled', body: 'First second', author: { kind: 'bot', slug: SLUG } });
    await until(target, (s) => s.messages.at(-1)?.id === 'settled');
    expect(target.getTimelineSnapshot()).not.toBe(before);
    expect(target.getTimelineSnapshot().drafts).toEqual([]);
    expect(target.getTimelineSnapshot().messages.at(-1)?.body).toBe('First second');
  });

  it('publishes a settled draft at once instead of waiting for the coalescing window', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 1);
    const target = open(host, { draftDelayMs: 60_000 });
    await until(target, (s) => s.status === 'live');
    const seen: number[] = [];
    target.subscribe(() => seen.push(target.getSnapshot().drafts.length));
    const event = { channelId: DM, draftId: 'draft-1', attemptId: 'attempt-1', revision: 1 };
    channel.emit({
      type: 'notification',
      notification: { kind: 'draft', draft: { ...event, botSlug: SLUG, body: 'Hel' } },
    });
    channel.emit({ type: 'notification', notification: { kind: 'draft-settled', event } });
    await until(target, () => seen.length > 0);
    expect(seen).toEqual([0]);
  });

  it('keeps each committed message object while new entries arrive', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 2);
    const target = open(host);
    const before = await until(target, (s) => s.status === 'live' && s.messages.length === 2);
    channel.append({ id: 'bot-3', body: 'more', author: { kind: 'bot', slug: SLUG } });
    const after = await until(target, (s) => s.messages.length === 3);
    expect(after.messages[0]).toBe(before.messages[0]);
    expect(after.messages[1]).toBe(before.messages[1]);
  });

  it('asks for draft appends and applies them on top of the whole body', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 1);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    expect(channel.follows).toEqual([{ channelId: DM, limit: 10, drafts: 'append' }]);
    const draft = { channelId: DM, draftId: 'draft-1', attemptId: 'attempt-1', botSlug: SLUG };
    channel.emit({
      type: 'notification',
      notification: { kind: 'draft', draft: { ...draft, body: 'Hel', revision: 1 } },
    });
    for (const [index, append] of ['lo ', '**there**'].entries())
      channel.emit({
        type: 'notification',
        notification: {
          kind: 'draft-append',
          append: {
            draftId: 'draft-1',
            revision: index + 2,
            base: index + 1,
            offset: index === 0 ? 3 : 6,
            append,
          },
        },
      });
    await until(target, (s) => s.drafts[0]?.body === 'Hello **there**');
    expect(target.getSnapshot().drafts).toEqual([
      { draftId: 'draft-1', botSlug: SLUG, body: 'Hello **there**' },
    ]);
    expect(channel.follows).toHaveLength(1);
  });

  it('follows again for the whole body when an append does not match its copy', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 1);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    const draft = { channelId: DM, draftId: 'draft-1', attemptId: 'attempt-1', botSlug: SLUG };
    channel.emit({
      type: 'notification',
      notification: { kind: 'draft', draft: { ...draft, body: 'Hel', revision: 1 } },
    });
    await until(target, (s) => s.drafts[0]?.body === 'Hel');
    channel.baselineDrafts = [{ ...draft, body: 'Hello there', revision: 4 }];
    channel.emit({
      type: 'notification',
      notification: {
        kind: 'draft-append',
        append: { draftId: 'draft-1', revision: 4, base: 2, offset: 5, append: ' there' },
      },
    });
    const repaired = await until(target, (s) => s.drafts[0]?.body === 'Hello there');
    expect(repaired.status).toBe('live');
    expect(channel.follows).toHaveLength(2);
    await until(target, () => channel.followerCount === 1);
  });

  it('keeps streaming whole draft bodies from a Host that refuses appends', async () => {
    const host = new FakeHost();
    host.olderHost = true;
    const channel = host.channel(DM);
    seed(channel, 1);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    expect(channel.follows).toEqual([
      { channelId: DM, limit: 10, drafts: 'append' },
      { channelId: DM, limit: 10 },
    ]);
    channel.emit({
      type: 'notification',
      notification: {
        kind: 'draft',
        draft: {
          channelId: DM,
          draftId: 'draft-1',
          attemptId: 'attempt-1',
          botSlug: SLUG,
          body: 'Hello',
          revision: 1,
        },
      },
    });
    await until(target, (s) => s.drafts[0]?.body === 'Hello');
  });

  it('resumes from the last revision after the connection drops, with nothing lost or doubled', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 4);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    host.kill();
    await until(target, (s) => s.status === 'interrupted');
    for (let index = 5; index <= 18; index += 1)
      channel.append({ id: `away-${index}`, body: `away ${index}` }, false);
    host.restart();
    const back = await until(target, (s) => s.status === 'live' && s.messages.length === 18);
    expect(revisions(back)).toEqual(Array.from({ length: 18 }, (_, index) => index + 1));
    expect(new Set(ids(back)).size).toBe(18);
    expect(host.calls.filter((call) => call.method === 'channelJournalPage').at(-1)?.args).toEqual({
      channelId: DM,
      through: 8,
      limit: 4,
    });
    channel.append({ id: 'after', body: 'after' });
    await until(target, (s) => s.messages.at(-1)?.revision === 19);
    expect(channel.followerCount).toBe(1);
  });

  it('repairs a gap between live entries through the journal', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 3);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    channel.append({ id: 'skipped-4', body: 'four' }, false);
    channel.append({ id: 'seen-5', body: 'five' });
    const repaired = await until(target, (s) => s.messages.at(-1)?.revision === 5);
    expect(ids(repaired).slice(-2)).toEqual(['skipped-4', 'seen-5']);
    expect(contiguous(repaired)).toBe(true);
    channel.emit({
      type: 'entry',
      entry: { channelId: DM, message: channel.messages[4]!, revision: 5 },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(target.getSnapshot().messages).toHaveLength(5);
  });

  it('cancels its stream when the screen closes', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    expect(channel.followerCount).toBe(1);
    target.stop();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(channel.followerCount).toBe(0);
  });
});
