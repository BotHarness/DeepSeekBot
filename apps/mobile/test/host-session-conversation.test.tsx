// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { remotes, secure } from './host-session-fixture';
import { FakeHost } from './fake-host';
import type { Conversation, ConversationSnapshot } from '../src/host/conversation';

vi.mock('expo-router', async () => {
  const { useEffect } = await import('react');
  return { useFocusEffect: useEffect };
});
vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options['ios'] },
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const hosts = { a: new FakeHost('a'), b: new FakeHost('b') };
let hooks: typeof import('../src/host/host-session');
let root: Root;
let container: HTMLDivElement;
let current: Conversation | undefined;
let snapshot: ConversationSnapshot;
let nextChannel = 0;
const pending = new Set<(fail?: boolean) => void>();

beforeAll(async () => {
  const saved = Object.entries(hosts).map(([hostId, host]) => {
    remotes.set(`${hostId}.tailnet.ts.net`, host);
    return {
      hostId,
      hostName: hostId,
      deviceId: 'device-1',
      credential: host.credential,
      routes: [`https://${hostId}.tailnet.ts.net`],
    };
  });
  secure.set('deepseekbot.hosts.v3', JSON.stringify({ hosts: saved, current: 'a' }));
  hooks = await import('../src/host/host-session');
  await vi.waitFor(() =>
    expect(hooks.hostSession.getHost('b')?.client.getSnapshot().connection.status).toBe(
      'connected',
    ),
  );
});
beforeEach(() => {
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  act(() => root.unmount());
  await act(async () => {
    for (const settle of pending) settle();
  });
  if (vi.isFakeTimers()) await act(async () => vi.advanceTimersByTimeAsync(1));
  vi.useRealTimers();
});
afterAll(async () => {
  for (const host of hooks.hostSession.getState().hosts)
    await hooks.hostSession.unpair(host.hostId);
});

function Screen({ hostId, channelId }: { hostId: string; channelId: string }) {
  const { client } = hooks.useHostSession(hostId);
  const conversation = hooks.useChannelConversation(client, channelId);
  const view = hooks.useConversationSnapshot(conversation);
  current = conversation;
  snapshot = view;
  return <output>{JSON.stringify(view.messages)}</output>;
}
async function flush() {
  await act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
}
async function open() {
  const channelId = `route-${++nextChannel}`;
  const channel = hosts.a.channel(channelId);
  let finish: (fail?: boolean) => void = () => {};
  hosts.a.methods.set(
    'channelSend',
    (args) =>
      new Promise((resolve, reject) => {
        finish = (fail = false) => {
          pending.delete(finish);
          if (fail) reject(new Error('offline'));
          else {
            if (!channel.messages.some((message) => message.id === args['messageId']))
              channel.append({ id: String(args['messageId']), body: String(args['body']) });
            resolve({ message: channel.messages.at(-1) });
          }
        };
        pending.add(finish);
      }),
  );
  const mount = async (hostId = 'a') => {
    act(() => root.render(<Screen hostId={hostId} channelId={channelId} />));
    await flush();
  };
  await mount();
  await vi.waitFor(() => expect(snapshot.status).toBe('live'));
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(10_000);
  return {
    channel,
    channelId,
    mount,
    leave: async () => {
      act(() => root.render(null));
      await act(async () => vi.advanceTimersByTimeAsync(1));
    },
    send: async () => {
      let id = '';
      act(() => {
        id = current!.send('Keep my pending message');
      });
      await flush();
      return id;
    },
    settle: async (fail = false) => {
      await act(async () => finish(fail));
      await flush();
    },
  };
}

it('retains the send identity and elapsed attempt across a route unmount and return', async () => {
  const view = await open();
  const id = await view.send();
  await view.leave();
  await act(async () => vi.advanceTimersByTimeAsync(4_000));
  await view.mount();
  expect(snapshot.messages).toEqual([
    expect.objectContaining({
      id,
      body: 'Keep my pending message',
      delivery: 'pending',
      attemptStartedAt: 10_000,
      at: '1970-01-01T00:00:10.000Z',
    }),
  ]);
  expect(Date.now() - snapshot.messages[0]!.attemptStartedAt!).toBeGreaterThan(3_000);
  expect(
    hosts.a.calls.filter(
      (call) => call.method === 'channelSend' && call.args['channelId'] === view.channelId,
    ),
  ).toHaveLength(1);
  await view.settle();
  expect(snapshot.messages).toEqual([
    expect.objectContaining({ id, delivery: 'committed', revision: 1 }),
  ]);
});

it('keeps a failed send retryable after leaving without retaining an idle live stream', async () => {
  const view = await open();
  const id = await view.send();
  await view.leave();
  await view.settle(true);
  expect(view.channel.followerCount).toBe(0);
  await act(async () => vi.advanceTimersByTimeAsync(4_000));
  await view.mount();
  expect(snapshot.messages).toEqual([
    expect.objectContaining({ id, delivery: 'failed', attemptStartedAt: 10_000 }),
  ]);
  const retryAt = Date.now();
  act(() => current!.retry(id));
  await flush();
  expect(snapshot.messages).toEqual([
    expect.objectContaining({
      id,
      delivery: 'pending',
      attemptStartedAt: retryAt,
      at: '1970-01-01T00:00:10.000Z',
    }),
  ]);
  await view.settle();
  expect(view.channel.messages).toHaveLength(1);
  expect(view.channel.messages[0]!.id).toBe(id);
  expect(
    hosts.a.calls
      .filter((call) => call.method === 'channelSend' && call.args['channelId'] === view.channelId)
      .map((call) => call.args['messageId']),
  ).toEqual([id, id]);
  await view.leave();
  expect(view.channel.followerCount).toBe(0);
});

it('isolates equal Channel IDs by Host and releases a settled owner while its route is absent', async () => {
  const view = await open();
  const id = await view.send();
  const owner = current;
  await view.leave();
  await view.mount('b');
  expect(snapshot.messages).toEqual([]);
  expect(hosts.b.calls.filter((call) => call.method === 'channelSend')).toEqual([]);
  await view.leave();
  await act(async () => vi.advanceTimersByTimeAsync(4_000));
  await view.mount('a');
  expect(snapshot.messages).toEqual([
    expect.objectContaining({ id, delivery: 'pending', attemptStartedAt: 10_000 }),
  ]);
  await view.leave();
  await view.settle();
  expect(view.channel.followerCount).toBe(0);
  await view.mount('a');
  expect(current).not.toBe(owner);
  expect(snapshot.messages).toEqual([
    expect.objectContaining({ id, delivery: 'committed', revision: 1 }),
  ]);
  await view.leave();
  expect(view.channel.followerCount).toBe(0);
});

it('drops the retained route owner when its Host session is removed', async () => {
  const view = await open();
  await view.send();
  await view.leave();
  const client = hooks.hostSession.getHost('a')!.client;
  await act(async () => {
    await hooks.hostSession.unpair('a');
  });
  expect(client.getSnapshot().connection.status).toBe('stopped');
  expect(view.channel.followerCount).toBe(0);
  await view.mount('b');
  expect(snapshot.messages).toEqual([]);
  await view.settle();
  expect(snapshot.messages).toEqual([]);
});
