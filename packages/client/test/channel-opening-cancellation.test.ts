import { expect, it, vi } from 'vitest';

import { createActions } from '../src/client/actions.js';
import { BridgeCallError, type BridgeCall } from '../src/client/bridge.js';
import { createStore } from '../src/client/store.js';

const targetChannel = {
  id: 'group-target',
  type: 'group' as const,
  name: 'Target',
  members: [],
  createdAt: '2026-11-02T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
};
const otherChannel = { ...targetChannel, id: 'group-other', name: 'Other' };
const emptyPage = {
  revision: 0,
  page: {
    entries: [],
    olderCursor: null,
    newerCursor: null,
    hasOlder: false,
    hasNewer: false,
  },
};

it.each(['read', 'latest', 'around'] as const)(
  'cancels an abandoned opening %s and preserves the selected Channel',
  async (stage) => {
    const clientStore = createStore();
    clientStore.setRoster([], [targetChannel, otherChannel]);
    let pendingSignal: AbortSignal | undefined;
    let release: (() => void) | undefined;
    let requested = false;
    const timelineRequests: string[] = [];
    const call: BridgeCall = async (endpoint, args, signal) => {
      const target = args.channelId === targetChannel.id;
      if (endpoint === 'channelTimeline') timelineRequests.push(String(args.channelId));
      if (
        target &&
        ((stage === 'read' && endpoint === 'channelReadPosition') ||
          (stage !== 'read' && endpoint === 'channelTimeline'))
      ) {
        requested = true;
        pendingSignal = signal;
        await new Promise<void>((resolve, reject) => {
          release = resolve;
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      }
      return {
        ok: true,
        value:
          endpoint === 'channelReadPosition'
            ? target && stage === 'around'
              ? { position: { messageId: 'anchor' } }
              : {}
            : emptyPage,
      };
    };
    const actions = createActions(call, clientStore);
    const abandoned = actions.openChannel(targetChannel.id);
    try {
      await vi.waitFor(() => expect(requested).toBe(true));
      await actions.openChannel(otherChannel.id);
      const visible = clientStore.getSnapshot().conversation;
      expect(pendingSignal).toBeInstanceOf(AbortSignal);
      expect(pendingSignal?.aborted).toBe(true);
      await abandoned;
      expect(clientStore.getSnapshot().conversation).toBe(visible);
      expect(visible.channel?.id).toBe(otherChannel.id);
      expect(visible.status).toBe('ready');
      expect(timelineRequests.filter((channelId) => channelId === targetChannel.id)).toHaveLength(
        stage === 'read' ? 0 : 1,
      );
    } finally {
      release?.();
      await abandoned;
    }
  },
);

it('releases opening subscriptions on success and failure and does not abort finished reads', async () => {
  const clientStore = createStore();
  clientStore.setRoster([], [targetChannel, otherChannel]);
  const subscribe = clientStore.subscribe.bind(clientStore);
  let subscriptions = 0;
  vi.spyOn(clientStore, 'subscribe').mockImplementation((listener) => {
    subscriptions += 1;
    const unsubscribe = subscribe(listener);
    return () => {
      subscriptions -= 1;
      unsubscribe();
    };
  });
  const signals: AbortSignal[] = [];
  let fail = false;
  const call: BridgeCall = async (endpoint, _args, signal) => {
    if (signal !== undefined) signals.push(signal);
    if (endpoint === 'channelReadPosition') {
      expect(subscriptions).toBe(1);
      return { ok: true, value: {} };
    }
    if (fail) throw new BridgeCallError('unavailable', 'offline');
    return { ok: true, value: emptyPage };
  };
  const actions = createActions(call, clientStore);
  await actions.openChannel(targetChannel.id);
  expect(subscriptions).toBe(0);
  expect(signals).toHaveLength(2);
  clientStore.select(undefined);
  expect(signals.every((signal) => !signal.aborted)).toBe(true);
  fail = true;
  await actions.openChannel(otherChannel.id);
  expect(subscriptions).toBe(0);
  expect(clientStore.getSnapshot().conversation.status).toBe('error');
});

it('cancels on direct deselection and releases its subscription without a newer opening', async () => {
  const clientStore = createStore();
  clientStore.setRoster([], [targetChannel]);
  const subscribe = clientStore.subscribe.bind(clientStore);
  const released = vi.fn();
  vi.spyOn(clientStore, 'subscribe').mockImplementation((listener) => {
    const unsubscribe = subscribe(listener);
    return () => {
      released();
      unsubscribe();
    };
  });
  let captured: AbortSignal | undefined;
  let release: (() => void) | undefined;
  const call: BridgeCall = async (_endpoint, _args, signal) => {
    captured = signal;
    await new Promise<void>((resolve, reject) => {
      release = resolve;
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    return { ok: true, value: {} };
  };
  const opening = createActions(call, clientStore).openChannel(targetChannel.id);
  try {
    await vi.waitFor(() => expect(release).toBeDefined());
    clientStore.select(undefined);
    expect(captured?.aborted).toBe(true);
    await opening;
    expect(released).toHaveBeenCalledOnce();
    expect(clientStore.getSnapshot().selection).toBeUndefined();
  } finally {
    release?.();
    await opening;
  }
});

it('shares the opening signal across expired-anchor fallback but never with read mutations', async () => {
  const clientStore = createStore();
  clientStore.setRoster([], [targetChannel]);
  const readSignals: Array<AbortSignal | undefined> = [];
  const writeSignals: Array<AbortSignal | undefined> = [];
  const call: BridgeCall = async (endpoint, args, signal) => {
    if (endpoint === 'channelMarkRead') {
      writeSignals.push(signal);
      return { ok: true, value: {} };
    }
    readSignals.push(signal);
    if (endpoint === 'channelReadPosition')
      return { ok: true, value: { position: { messageId: 'expired' } } };
    if (args.direction === 'around') throw new BridgeCallError('invalid-input', 'expired');
    return { ok: true, value: emptyPage };
  };
  const actions = createActions(call, clientStore);
  await actions.openChannel(targetChannel.id);
  expect(readSignals).toHaveLength(3);
  expect(readSignals[0]).toBeInstanceOf(AbortSignal);
  expect(new Set(readSignals).size).toBe(1);
  expect(readSignals[0]?.aborted).toBe(false);
  expect(clientStore.getSnapshot().conversation.status).toBe('ready');
  await actions.markRead(targetChannel.id, 'message');
  expect(writeSignals).toEqual([undefined]);
});

it('does not cancel the current opening for unrelated store updates', async () => {
  const clientStore = createStore();
  clientStore.setRoster([], [targetChannel]);
  let captured: AbortSignal | undefined;
  const call: BridgeCall = async (endpoint, _args, signal) => {
    captured = signal;
    clientStore.setRoster([], [targetChannel, otherChannel]);
    expect(signal?.aborted).toBe(false);
    return { ok: true, value: endpoint === 'channelReadPosition' ? {} : emptyPage };
  };
  await createActions(call, clientStore).openChannel(targetChannel.id);
  expect(captured?.aborted).toBe(false);
  expect(clientStore.getSnapshot().conversation.status).toBe('ready');
});
