import { describe, expect, it } from 'vitest';
import { setup } from './bridge-helpers.js';

describe('bridge actions', () => {
  it('keeps the visible window on older-page failure and prepends exactly once on retry', async () => {
    const entry = (id: string) => ({
      id,
      at: '2026-09-19T00:01:00.000Z',
      author: { kind: 'human' },
      body: id,
    });
    let failOlder = true;
    const { clientStore, actions } = setup({
      channelTimeline: (payload) => {
        if (payload['direction'] === 'older') {
          expect(payload['cursor']).toBe('cursor-m2');
          if (failOlder) throw new Error('temporarily unavailable');
          return {
            revision: 4,
            page: {
              entries: [entry('m0'), entry('m1')],
              olderCursor: 'cursor-m0',
              newerCursor: 'cursor-m1',
              hasOlder: false,
              hasNewer: true,
            },
          };
        }
        return {
          revision: 4,
          page: {
            entries: [entry('m2'), entry('m3')],
            olderCursor: 'cursor-m2',
            newerCursor: 'cursor-m3',
            hasOlder: true,
            hasNewer: false,
          },
        };
      },
    });
    await actions.load();
    await actions.openBot('ada');
    expect(clientStore.getSnapshot().conversation.messages.map((item) => item.id)).toEqual([
      'm2',
      'm3',
    ]);
    await actions.loadOlder('dm-ada');
    expect(clientStore.getSnapshot().conversation.messages.map((item) => item.id)).toEqual([
      'm2',
      'm3',
    ]);
    expect(clientStore.getSnapshot().conversation.timeline.olderError).toBe(
      'temporarily unavailable',
    );
    failOlder = false;
    await actions.loadOlder('dm-ada');
    expect(clientStore.getSnapshot().conversation.messages.map((item) => item.id)).toEqual([
      'm0',
      'm1',
      'm2',
      'm3',
    ]);
    expect(clientStore.getSnapshot().conversation.timeline.hasOlder).toBe(false);
  });

  it('opens around a target, pages forward contiguously, then returns to latest', async () => {
    const entry = (id: string) => ({
      id,
      at: '2026-09-19T00:01:00.000Z',
      author: { kind: 'human' },
      body: id,
    });
    const { clientStore, actions } = setup({
      channelTimeline: (payload) => {
        if (payload['direction'] === 'around') {
          expect(payload['around']).toBe('m2');
          return {
            revision: 7,
            page: {
              entries: [entry('m1'), entry('m2'), entry('m3')],
              olderCursor: 'c1',
              newerCursor: 'c3',
              hasOlder: true,
              hasNewer: true,
            },
          };
        }
        if (payload['direction'] === 'newer') {
          expect(payload['cursor']).toBe('c3');
          return {
            revision: 7,
            page: {
              entries: [entry('m4'), entry('m5'), entry('m6')],
              olderCursor: 'c4',
              newerCursor: 'c6',
              hasOlder: true,
              hasNewer: false,
            },
          };
        }
        return {
          revision: 7,
          page: {
            entries: [entry('m5'), entry('m6')],
            olderCursor: 'c5',
            newerCursor: 'c6',
            hasOlder: true,
            hasNewer: false,
          },
        };
      },
    });
    await actions.load();
    await actions.openBot('ada');
    await actions.openAround('dm-ada', 'm2');
    expect(clientStore.getSnapshot().conversation.messages.map((item) => item.id)).toEqual([
      'm1',
      'm2',
      'm3',
    ]);
    expect(clientStore.getSnapshot().conversation.focusMessageId).toBe('m2');
    await actions.loadNewer('dm-ada');
    expect(clientStore.getSnapshot().conversation.messages.map((item) => item.id)).toEqual([
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
      'm6',
    ]);
    expect(clientStore.getSnapshot().conversation.timeline.hasNewer).toBe(false);
    await actions.openLatest('dm-ada');
    expect(clientStore.getSnapshot().conversation.messages.map((item) => item.id)).toEqual([
      'm5',
      'm6',
    ]);
    expect(clientStore.getSnapshot().conversation.focusMessageId).toBeUndefined();
  });

  it('stops newer pagination when the Host cursor does not advance', async () => {
    const entry = (id: string) => ({
      id,
      at: '2026-09-19T00:01:00.000Z',
      author: { kind: 'human' },
      body: id,
    });
    const { clientStore, actions } = setup({
      channelTimeline: (payload) => {
        if (payload['direction'] === 'around') {
          return {
            revision: 4,
            page: {
              entries: [entry('m1'), entry('m2')],
              olderCursor: null,
              newerCursor: 'c2',
              hasOlder: false,
              hasNewer: true,
            },
          };
        }
        if (payload['direction'] === 'newer') {
          return {
            revision: 4,
            page: {
              entries: [],
              olderCursor: 'c2',
              newerCursor: 'c2',
              hasOlder: true,
              hasNewer: true,
            },
          };
        }
        return {
          revision: 4,
          page: {
            entries: [entry('m3'), entry('m4')],
            olderCursor: 'c3',
            newerCursor: null,
            hasOlder: true,
            hasNewer: false,
          },
        };
      },
    });
    await actions.load();
    await actions.openBot('ada');
    await actions.openAround('dm-ada', 'm2');
    await actions.loadNewer('dm-ada');
    expect(clientStore.getSnapshot().conversation.timeline).toMatchObject({
      hasNewer: false,
      loadingNewer: false,
      newerError: 'Timeline newer cursor did not advance',
    });
  });

  it('does not splice an in-flight older page into a newly opened around window', async () => {
    let completeOlder: (value: unknown) => void = () => {};
    const delayedOlder = new Promise<unknown>((resolve) => {
      completeOlder = resolve;
    });
    const entry = (id: string) => ({
      id,
      at: '2026-09-19T00:01:00.000Z',
      author: { kind: 'human' },
      body: id,
    });
    const page = (ids: string[], olderCursor: string, hasNewer: boolean) => ({
      revision: 4,
      page: {
        entries: ids.map(entry),
        olderCursor,
        newerCursor: ids.at(-1) ?? null,
        hasOlder: true,
        hasNewer,
      },
    });
    const { clientStore, actions } = setup({
      channelTimeline: (payload) =>
        payload['direction'] === 'older'
          ? delayedOlder
          : payload['direction'] === 'around'
            ? page(['m1', 'm2'], 'around-m1', true)
            : page(['m3', 'm4'], 'latest-m3', false),
    });
    await actions.load();
    await actions.openBot('ada');
    const loading = actions.loadOlder('dm-ada');
    await actions.openAround('dm-ada', 'm1');
    completeOlder(page(['m0'], 'older-m0', true));
    await loading;
    expect(clientStore.getSnapshot().conversation.messages.map((item) => item.id)).toEqual([
      'm1',
      'm2',
    ]);
    expect(clientStore.getSnapshot().conversation.timeline.olderCursor).toBe('around-m1');
  });

  it('restores a hidden failed bubble when newer paging reaches the tail', async () => {
    const entry = (id: string) => ({
      id,
      at: '2026-09-19T00:01:00.000Z',
      author: { kind: 'human' },
      body: id,
    });
    const { clientStore, actions } = setup({
      channelSend: () => {
        throw new Error('offline');
      },
      channelTimeline: (payload) => {
        if (payload['direction'] === 'around') {
          return {
            revision: 4,
            page: {
              entries: [entry('m1'), entry('m2')],
              olderCursor: null,
              newerCursor: 'c2',
              hasOlder: false,
              hasNewer: true,
            },
          };
        }
        if (payload['direction'] === 'newer') {
          return {
            revision: 4,
            page: {
              entries: [entry('m3'), entry('m4')],
              olderCursor: 'c3',
              newerCursor: null,
              hasOlder: true,
              hasNewer: false,
            },
          };
        }
        return {
          revision: 4,
          page: {
            entries: [entry('m3'), entry('m4')],
            olderCursor: 'c3',
            newerCursor: null,
            hasOlder: true,
            hasNewer: false,
          },
        };
      },
    });
    await actions.load();
    await actions.openBot('ada');
    await actions.send('restore me');
    const failedId = clientStore.getSnapshot().conversation.messages.at(-1)?.id;
    await actions.openAround('dm-ada', 'm2');
    expect(
      clientStore.getSnapshot().conversation.messages.some((item) => item.id === failedId),
    ).toBe(false);
    await actions.loadNewer('dm-ada');
    expect(clientStore.getSnapshot().conversation.messages.at(-1)).toMatchObject({
      id: failedId,
      body: 'restore me',
      failed: 'offline',
    });
    await actions.openAround('dm-ada', 'm2');
    await actions.send('second failure');
    const retained = clientStore
      .getSnapshot()
      .conversation.messages.find((message) => message.id === failedId);
    expect(retained).toMatchObject({ body: 'restore me', failed: 'offline' });
  });
});
