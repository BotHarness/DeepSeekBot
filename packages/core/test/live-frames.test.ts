import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LiveRefused, openLiveFrames, parseLiveFrame } from '../src/channels/live-frames.js';
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import { ChannelDraftTracker } from '../src/channels/draft.js';
import {
  createChannelLiveHub,
  type ChannelLiveFrame,
  type ChannelLiveHub,
  type DraftDelivery,
} from '../src/channels/live.js';
import { createChannelStore } from '../src/channels/store.js';
import { followCompanion } from '../src/companions/live.js';

const roots: string[] = [];
const hubs: ChannelLiveHub[] = [];
function root(): string {
  const directory = mkdtempSync(join(tmpdir(), 'bh-live-frames-'));
  roots.push(directory);
  return directory;
}
afterEach(() => {
  for (const hub of hubs.splice(0)) hub.close();
  for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('live frames on the native stream carrier', () => {
  it('parses event, id and multi-line data and drops comments and retry hints', () => {
    expect(parseLiveFrame('id: 7\nevent: channel/message\ndata: {"a":1}')).toEqual({
      event: 'channel/message',
      data: '{"a":1}',
      id: '7',
    });
    expect(parseLiveFrame('data: one\ndata: two')).toEqual({ event: 'message', data: 'one\ntwo' });
    expect(parseLiveFrame(': heartbeat')).toBeUndefined();
    expect(parseLiveFrame('retry: 1500')).toBeUndefined();
  });

  it('opens the existing hub, yields its roster facts and releases the subscriber on abort', async () => {
    const placements = [{ sourceEventId: 'source', channelId: 'channel', messageId: 'message' }];
    const hub = createChannelLiveHub(
      createChannelStore({ rootDir: root() }),
      undefined,
      () => placements,
    );
    hubs.push(hub);
    const abort = new AbortController();
    const frames = openLiveFrames((request) => hub.open(request), 'scope=roster', '', abort.signal);
    expect((await frames.next()).value).toEqual({ event: 'open', data: '' });
    const purged = (await frames.next()).value;
    expect(purged.event).toBe('content/purged');
    expect(JSON.parse(purged.data)).toEqual({ placements });
    hub.publishRosterCommitted();
    expect((await frames.next()).value).toEqual({ event: 'roster/changed', data: '{}' });
    const pending = frames.next();
    abort.abort();
    expect((await pending).done).toBe(true);
    hub.publishRosterCommitted();
  });

  it('ends when the hub closes and refuses what the HTTP route refuses', async () => {
    const hub = createChannelLiveHub(createChannelStore({ rootDir: root() }));
    hubs.push(hub);
    const open = (request: Request): Response => hub.open(request);
    const frames = openLiveFrames(open, 'scope=roster', '', new AbortController().signal);
    await frames.next();
    const closing = frames.next();
    hub.close();
    expect((await closing).done).toBe(true);

    const missing = openLiveFrames(open, 'channelId=missing', '', new AbortController().signal);
    await expect(missing.next()).rejects.toMatchObject({ name: 'LiveRefused', code: 'not-found' });
    const oversized = openLiveFrames(open, 'a'.repeat(4096), '', new AbortController().signal);
    await expect(oversized.next()).rejects.toBeInstanceOf(LiveRefused);
    const aborted = new AbortController();
    aborted.abort();
    expect((await openLiveFrames(open, 'scope=roster', '', aborted.signal).next()).done).toBe(true);
  });

  it('follows the roster as a baseline and typed increments and releases on abort', async () => {
    let placements = [{ sourceEventId: 'source', channelId: 'channel', messageId: 'message' }];
    const hub = createChannelLiveHub(
      createChannelStore({ rootDir: root() }),
      undefined,
      () => placements,
    );
    hubs.push(hub);
    const abort = new AbortController();
    const frames = hub.followRoster(abort.signal)[Symbol.asyncIterator]();
    expect((await frames.next()).value).toEqual({ type: 'baseline', placements });
    hub.publishRosterCommitted();
    hub.publishRosterCommitted();
    placements = [{ sourceEventId: 'new', channelId: 'shared', messageId: 'new-message' }];
    hub.publishContentPurged();
    expect((await frames.next()).value).toEqual({ type: 'changed' });
    expect((await frames.next()).value).toEqual({ type: 'purged', placements });
    const pending = frames.next();
    abort.abort();
    expect((await pending).done).toBe(true);
    hub.publishRosterCommitted();

    const closing = hub.followRoster(new AbortController().signal)[Symbol.asyncIterator]();
    await closing.next();
    const ended = closing.next();
    hub.close();
    expect((await ended).done).toBe(true);
  });

  it("carries each Channel's latest non-notice message on the roster, newest per Channel", async () => {
    const hub = createChannelLiveHub(createChannelStore({ rootDir: root() }));
    hubs.push(hub);
    const abort = new AbortController();
    const frames = hub.followRoster(abort.signal)[Symbol.asyncIterator]();
    await frames.next();
    const message = (id: string, extra: object = {}) => ({
      id,
      at: '2026-10-13T00:00:00.000Z',
      author: { kind: 'human' as const },
      body: id,
      ...extra,
    });
    hub.publishCommitted({ channelId: 'a', revision: 1, message: message('a-1') });
    hub.publishCommitted({ channelId: 'b', revision: 1, message: message('b-1') });
    hub.publishCommitted({ channelId: 'a', revision: 2, message: message('a-2') });
    hub.publishCommitted({
      channelId: 'a',
      revision: 3,
      message: message('a-notice', { memoryCommit: {} }),
    } as never);
    expect((await frames.next()).value).toEqual({
      type: 'latest',
      channelId: 'b',
      message: message('b-1'),
    });
    expect((await frames.next()).value).toEqual({
      type: 'latest',
      channelId: 'a',
      message: message('a-2'),
    });
    const pending = frames.next();
    abort.abort();
    expect((await pending).done).toBe(true);
  });

  it('sends the latest Channel message as a roster SSE event', async () => {
    const hub = createChannelLiveHub(createChannelStore({ rootDir: root() }));
    hubs.push(hub);
    const abort = new AbortController();
    const frames = openLiveFrames((request) => hub.open(request), 'scope=roster', '', abort.signal);
    await frames.next();
    const message = {
      id: 'm1',
      at: '2026-10-13T00:00:00.000Z',
      author: { kind: 'human' as const },
      body: 'hello',
    };
    hub.publishCommitted({ channelId: 'c1', revision: 1, message });
    const frame = (await frames.next()).value;
    expect(frame.event).toBe('roster/latest');
    expect(JSON.parse(frame.data)).toEqual({ channelId: 'c1', message });
    abort.abort();
  });

  it('follows Activity as a baseline and coalesced replacement snapshots', async () => {
    let revision = 0;
    const listeners = new Set<() => void>();
    const activity = {
      snapshot: () => ({ generation: 'g', revision, bots: {} }) as never,
      onChange: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const hub = createChannelLiveHub(createChannelStore({ rootDir: root() }), activity);
    hubs.push(hub);
    const abort = new AbortController();
    const frames = hub.followActivity(abort.signal)[Symbol.asyncIterator]();
    expect((await frames.next()).value).toMatchObject({
      type: 'baseline',
      snapshot: { revision: 0 },
    });
    for (revision = 1; revision < 4; revision++) for (const listener of listeners) listener();
    revision = 3;
    expect((await frames.next()).value).toMatchObject({
      type: 'changed',
      snapshot: { revision: 3 },
    });
    const pending = frames.next();
    abort.abort();
    expect((await pending).done).toBe(true);
    expect(listeners.size).toBe(0);

    const missing = createChannelLiveHub(createChannelStore({ rootDir: root() }));
    hubs.push(missing);
    await expect(
      missing.followActivity(new AbortController().signal)[Symbol.asyncIterator]().next(),
    ).rejects.toMatchObject({ name: 'LiveUnavailable' });
  });

  it('opens a Channel with its tail page, then entries and typed notifications, and reads pages fixed at a revision', async () => {
    let live: ChannelLiveHub | undefined;
    const store = createChannelStore({
      rootDir: root(),
      onCommitted: (commit) => live?.publishCommitted(commit),
    });
    const group = store.createGroup({ name: 'Team', members: [] });
    const text = (id: string) => ({
      id,
      at: '2026-09-21T00:00:00.000Z',
      author: { kind: 'human' as const },
      body: id,
    });
    for (const id of ['one', 'two', 'three']) await store.appendMessage(group.id, text(id));
    const hub = createChannelLiveHub(store);
    live = hub;
    hubs.push(hub);
    const abort = new AbortController();
    const frames = hub.followChannel(group.id, 2, abort.signal)[Symbol.asyncIterator]();
    const opened = (await frames.next()).value;
    expect(opened).toMatchObject({ type: 'opened', cursor: 3 });
    expect(opened.page.entries.map((entry: { revision: number }) => entry.revision)).toEqual([
      2, 3,
    ]);
    expect(opened.page.entries[1].message.id).toBe('three');
    expect(opened.page.hasOlder).toBe(true);
    expect(typeof opened.page.olderCursor).toBe('string');
    let baseline = (await frames.next()).value;
    while (baseline.type !== 'notification' || baseline.notification.kind !== 'draft-baseline')
      baseline = (await frames.next()).value;
    await store.appendMessage(group.id, text('four'));
    expect((await frames.next()).value).toMatchObject({
      type: 'entry',
      entry: { channelId: group.id, revision: 4, message: { id: 'four' } },
    });
    hub.publishHumanRead(group.id, 'local-human', 4);
    expect((await frames.next()).value).toEqual({
      type: 'notification',
      notification: {
        kind: 'human-read',
        channelId: group.id,
        humanId: 'local-human',
        revision: 4,
      },
    });
    const pending = frames.next();
    abort.abort();
    expect((await pending).done).toBe(true);

    const fixed = store.readHumanJournalPage(group.id, { through: 3, limit: 2 });
    expect(fixed?.entries.map((entry) => entry.revision)).toEqual([2, 3]);
    const older = store.readHumanJournalPage(group.id, { through: 4, before: 2, limit: 5 });
    expect(older?.entries.map((entry) => entry.revision)).toEqual([1]);
    expect(older?.hasOlder).toBe(false);
    expect(store.readHumanJournalPage(group.id, { through: 99 })).toBeUndefined();
    expect(store.readHumanJournalPage('missing', { through: 0 })).toBeUndefined();

    const refused = async (channelId: string, limit: number) =>
      hub
        .followChannel(channelId, limit, new AbortController().signal)
        [Symbol.asyncIterator]()
        .next();
    await expect(refused('missing', 50)).rejects.toMatchObject({ code: 'not-found' });
    await expect(refused(group.id, 0)).rejects.toMatchObject({ code: 'invalid' });
    await expect(refused(group.id, 9999)).rejects.toMatchObject({ code: 'invalid' });
  });

  it('streams drafts as appended text to followers that ask, rebuilding the same bodies', async () => {
    const store = createChannelStore({ rootDir: root() });
    const dm = store.createGroup({ name: 'Team', members: [] });
    const hub = createChannelLiveHub(store);
    hubs.push(hub);
    const abort = new AbortController();
    const follow = (drafts?: DraftDelivery) => {
      const frames: ChannelLiveFrame[] = [];
      const done = (async () => {
        for await (const frame of hub.followChannel(dm.id, 10, abort.signal, drafts))
          frames.push(frame);
      })();
      return { frames, done };
    };
    const notifications = (frames: ChannelLiveFrame[]) =>
      frames.flatMap((frame) => (frame.type === 'notification' ? [frame.notification] : []));
    const full = follow();
    const appended = follow('append');
    await Promise.resolve();

    const tracker = new ChannelDraftTracker((event) => hub.publishDraft(event));
    tracker.begin('orchestrator-ada', { channelId: dm.id, botSlug: 'ada', canAccess: () => true });
    const reply = 'The quick brown fox, 你好。'.repeat(80);
    const fragments = ['{"body":"', ...reply.match(/.{1,3}/gsu)!, '"}'];
    for (const [index, fragment] of fragments.entries())
      tracker.accept('orchestrator-ada', {
        type: 'chunk',
        attemptId: 'attempt-1',
        revision: 1,
        index,
        time: 1,
        chunk: {
          type: 'tool-call-delta',
          index: 0,
          id: 'call-1',
          name: 'channel_send',
          argumentsDelta: fragment,
        },
      } as AssistantStreamFrame);
    const late = follow('append');
    await Promise.resolve();
    hub.publishDraft({
      type: 'update',
      draft: {
        channelId: dm.id,
        draftId: 'attempt-1:call-1',
        attemptId: 'attempt-1',
        botSlug: 'ada',
        body: reply + '!',
      },
    });
    hub.publishDraft({
      type: 'update',
      draft: {
        channelId: dm.id,
        draftId: 'attempt-1:call-1',
        attemptId: 'attempt-1',
        botSlug: 'ada',
        body: 'rewritten',
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    abort.abort();
    await Promise.all([full.done, appended.done, late.done]);

    const fullBodies = notifications(full.frames).flatMap((item) =>
      item.kind === 'draft' ? [item.draft.body] : [],
    );
    expect(notifications(full.frames).some((item) => item.kind === 'draft-append')).toBe(false);
    expect(fullBodies.at(-2)).toBe(reply + '!');
    const rebuild = (frames: ChannelLiveFrame[]) => {
      const bodies: string[] = [];
      let body: string | undefined;
      let revision: number | undefined;
      for (const item of notifications(frames)) {
        if (item.kind === 'draft-baseline') {
          const draft = item.drafts[0];
          body = draft?.body;
          revision = draft?.revision;
        } else if (item.kind === 'draft') {
          body = item.draft.body;
          revision = item.draft.revision;
          bodies.push(body);
        } else if (item.kind === 'draft-append') {
          expect(item.append).toMatchObject({ base: revision, offset: body?.length });
          body = body + item.append.append;
          revision = item.append.revision;
          bodies.push(body);
        }
      }
      return bodies;
    };
    expect(rebuild(appended.frames)).toEqual(fullBodies);
    expect(rebuild(late.frames)).toEqual(fullBodies.slice(-2));
    const kinds = notifications(appended.frames).map((item) => item.kind);
    expect(kinds.filter((kind) => kind === 'draft')).toHaveLength(2);
    expect(kinds.filter((kind) => kind === 'draft-append')).toHaveLength(fullBodies.length - 2);

    const bytes = (frames: ChannelLiveFrame[]) =>
      notifications(frames)
        .filter((item) => item.kind === 'draft' || item.kind === 'draft-append')
        .reduce((total, item) => total + Buffer.byteLength(JSON.stringify(item)), 0);
    expect(bytes(appended.frames) * 10).toBeLessThan(bytes(full.frames));

    await expect(
      hub
        .followChannel(dm.id, 10, new AbortController().signal, 'bogus' as DraftDelivery)
        [Symbol.asyncIterator]()
        .next(),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('follows the Companion feed as typed frames, passing resume identity and refusals through', async () => {
    const requests: Request[] = [];
    let cancelled = false;
    const open = (request: Request): Response => {
      requests.push(request);
      if (new URL(request.url).searchParams.get('resume') === 'gone')
        return new Response('Subscription unavailable', { status: 404 });
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'event: companion/baseline\ndata: {"consumerId":"c1","bots":[]}\nid: c1\n\n' +
                  ': heartbeat\n\nevent: companion/message\ndata: {"botId":"ada"}\nid: c1\n\n',
              ),
            );
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
    };
    const abort = new AbortController();
    const frames = followCompanion(open, 'r1', 'last', abort.signal);
    expect((await frames.next()).value).toEqual({
      type: 'baseline',
      value: { consumerId: 'c1', bots: [] },
      id: 'c1',
    });
    expect((await frames.next()).value).toEqual({
      type: 'message',
      value: { botId: 'ada' },
      id: 'c1',
    });
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe('/api/botharness/companion');
    expect(url.search).toBe('?subscribe=1&resume=r1');
    expect(requests[0]!.headers.get('Last-Event-ID')).toBe('last');
    const pending = frames.next();
    abort.abort();
    expect((await pending).done).toBe(true);
    expect(cancelled).toBe(true);

    await expect(
      followCompanion(open, 'gone', '', new AbortController().signal).next(),
    ).rejects.toMatchObject({ name: 'LiveRefused', code: 'not-found' });
    await expect(
      followCompanion(open, 'x'.repeat(200), '', new AbortController().signal).next(),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
});
