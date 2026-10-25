// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientError, publicInstance, MOBILE_REDIRECT_URI } from '../src/cloud/instance-contract';
const state = vi.hoisted(() => ({
  initialChannelId: 'channel_a' as string | undefined,
  userId: 'user_a',
  messages: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
  open: vi.fn(),
  list: vi.fn(),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-keyboard-controller', () => import('./keyboard-controller-shim'));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: () => void) => fn() }));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('expo-router', async () => {
  const { useEffect } = await import('react');
  return {
    router: { push: vi.fn() },
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
    useLocalSearchParams: () => ({
      instanceId: 'uat',
      organizationId: 'org_a',
      channelId: state.initialChannelId,
    }),
  };
});
vi.mock('../src/host/native-source-drafts', async () => {
  const { useState } = await import('react');
  return { useSourceDraft: () => useState('') };
});
vi.mock('../src/cloud/native-message-cache', () => ({
  readCloudMessages: state.read,
  removeCloudMessages: state.remove,
  cacheCloudMessages: vi.fn(),
}));
vi.mock('../src/cloud/native', () => ({
  cloudClient: {
    openChannel: state.open,
    whoami: async () => {},
    listChannels: state.list,
    readMessages: state.messages,
  },
  useCloudSnapshot: () => ({
    ready: true,
    busy: false,
    rows: [
      {
        config: publicInstance({
          instanceId: 'uat',
          environment: 'uat',
          server: 'https://uat.example.test',
          clientId: 'client_test',
          issuer: 'https://api.workos.com/user_management/client_test',
          authkitDomain: 'test-staging.authkit.app',
          mobileRedirectUri: MOBILE_REDIRECT_URI,
        }),
        hasSession: true,
        sessionUserId: state.userId,
        organization: { role: 'member', name: 'A' },
      },
    ],
  }),
}));
import { cloudViewScope } from '../src/cloud/workspace-directory';
import { useCloudSnapshot } from '../src/cloud/native';
import { CloudChannelsScreen } from '../src/ui/cloud/channels-screen';
import { interfacePreferences } from '../src/ui/interface-preferences';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const cached = {
  channel: { channelId: 'channel_a', name: 'Private channel' },
  messages: [{ sequence: 1, text: 'Cached private text', authorId: 'a', authorType: 'human' }],
  hasMore: false,
};
beforeEach(() => {
  interfacePreferences.setLanguage('en');
  state.userId = 'user_a';
  state.list.mockReset().mockResolvedValue({
    channels: [{ channelId: 'channel_b', name: 'B' }],
    nextCursor: null,
  });
});
afterEach(() => {
  interfacePreferences.setLanguage('system');
  state.initialChannelId = 'channel_a';
});
describe('cloud channel cached access', () => {
  it.each(['ORGANIZATION_ACCESS_DENIED', 'NETWORK_UNAVAILABLE'])(
    'handles %s when refreshing a previously loaded channel list',
    async (code) => {
      state.initialChannelId = undefined;
      state.list.mockResolvedValueOnce({
        channels: [{ channelId: 'channel_b', name: 'B' }],
        nextCursor: 'next-page',
      });
      const node = document.createElement('div');
      const root = createRoot(node);
      await act(async () => root.render(<CloudChannelsScreen />));
      const buttons = () => [...node.querySelectorAll('button')];
      expect(buttons().some((b) => b.textContent === 'Open channel: B')).toBe(true);
      state.list.mockRejectedValueOnce(new ClientError(code));
      await act(async () =>
        buttons()
          .find((b) => b.textContent === 'Reload channels')!
          .click(),
      );
      expect(node.textContent).toContain(code);
      expect(buttons().some((b) => b.textContent === 'Open channel: B')).toBe(
        code === 'NETWORK_UNAVAILABLE',
      );
      expect(buttons().some((b) => b.textContent === 'Load more')).toBe(
        code === 'NETWORK_UNAVAILABLE',
      );
      state.list.mockResolvedValueOnce({ channels: [], nextCursor: null });
      await act(async () =>
        buttons()
          .find((b) => b.textContent === 'Reload channels')!
          .click(),
      );
      expect(buttons().some((b) => b.textContent === 'Open channel: B')).toBe(false);
      act(() => root.unmount());
    },
  );
  it('clears the old list as well as the open channel on organization access loss', async () => {
    state.initialChannelId = undefined;
    state.messages.mockResolvedValueOnce({
      messages: cached.messages,
      nextCursor: 1,
      hasMore: false,
    });
    const node = document.createElement('div');
    const root = createRoot(node);
    await act(async () => root.render(<CloudChannelsScreen />));
    const button = (label: string) =>
      [...node.querySelectorAll('button')].find((b) => b.textContent === label);
    await act(async () => button('Open channel: B')!.click());
    expect(node.textContent).toContain('Cached private text');
    state.messages.mockRejectedValueOnce(new ClientError('ORGANIZATION_ACCESS_DENIED'));
    await act(async () => button('Reload messages')!.click());
    expect(node.textContent).toContain('ORGANIZATION_ACCESS_DENIED');
    expect(node.textContent).not.toContain('Cached private text');
    expect(button('Reload messages')).toBeUndefined();
    expect(button('Open channel: B')).toBeUndefined();
    act(() => root.unmount());
  });
  it.each(['CHANNEL_ACCESS_DENIED', 'ORGANIZATION_ACCESS_DENIED', 'NETWORK_UNAVAILABLE'])(
    'handles %s after cache has loaded',
    async (code) => {
      state.remove.mockReset();
      state.read.mockResolvedValue(cached);
      let reject: (error: Error) => void = () => {};
      state.open.mockImplementation(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail;
          }),
      );
      const node = document.createElement('div');
      const root = createRoot(node);
      await act(async () => root.render(<CloudChannelsScreen />));
      expect(node.textContent).toContain('Cached private text');
      await act(async () => reject(new ClientError(code)));
      if (code === 'NETWORK_UNAVAILABLE') {
        expect(node.textContent).toContain('Cached private text');
        expect(state.remove).not.toHaveBeenCalled();
      } else {
        expect(node.textContent).not.toContain('Cached private text');
        expect(state.remove).toHaveBeenCalled();
      }
      act(() => root.unmount());
    },
  );
  it('invalidates the attempted list channel rather than the previous render selection', async () => {
    state.initialChannelId = undefined;
    state.remove.mockReset();
    state.messages.mockRejectedValue(new ClientError('CHANNEL_ACCESS_DENIED'));
    const node = document.createElement('div');
    const root = createRoot(node);
    await act(async () => root.render(<CloudChannelsScreen />));
    const button = [...node.querySelectorAll('button')].find((entry) =>
      entry.textContent?.endsWith(': B'),
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());
    expect(state.remove).toHaveBeenCalledWith(
      JSON.stringify(['cloud', cloudViewScope(useCloudSnapshot().rows[0]), 'org_a', 'channel_b']),
    );
    act(() => root.unmount());
  });
  it.each(['CHANNEL_ACCESS_DENIED', 'ORGANIZATION_ACCESS_DENIED'])(
    'does not resurrect a delayed cache after %s',
    async (code) => {
      let release: (value: unknown) => void = () => {};
      state.read.mockImplementation(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      state.open.mockRejectedValue(new ClientError(code));
      const node = document.createElement('div');
      const root = createRoot(node);
      await act(async () => root.render(<CloudChannelsScreen />));
      await act(async () => release(cached));
      expect(node.textContent).not.toContain('Cached private text');
      act(() => root.unmount());
    },
  );
});

it('removes the previous account channel rows while the replacement directory is loading', async () => {
  state.initialChannelId = undefined;
  const node = document.createElement('div');
  const root = createRoot(node);
  await act(async () => root.render(<CloudChannelsScreen />));
  expect(node.textContent).toContain('Open channel: B');
  state.userId = 'user_b';
  state.list.mockReturnValueOnce(new Promise(() => {}));
  await act(async () => root.render(<CloudChannelsScreen />));
  expect(node.textContent).not.toContain('Open channel: B');
  act(() => root.unmount());
});

it('does not hydrate old account cached history after the account is replaced', async () => {
  let finish!: (value: typeof cached) => void;
  state.read.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  state.open.mockResolvedValue(cached.channel);
  state.messages.mockResolvedValue({ messages: [], hasMore: false });
  const node = document.createElement('div');
  const root = createRoot(node);
  await act(async () => root.render(<CloudChannelsScreen />));
  state.userId = 'user_b';
  state.read.mockResolvedValueOnce(null);
  state.open.mockRejectedValueOnce(new ClientError('CHANNEL_ACCESS_DENIED'));
  await act(async () => root.render(<CloudChannelsScreen />));
  await act(async () => finish(cached));
  expect(node.textContent).not.toContain('Cached private text');
  expect(node.textContent).not.toContain('Private channel');
  act(() => root.unmount());
});
