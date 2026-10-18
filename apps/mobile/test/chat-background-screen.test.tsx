// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ params: {} as Record<string, unknown> }));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => route.params,
  useRouter: () => ({ back() {} }),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-safe-area-context', async () => ({
  SafeAreaView: (await import('./react-native-shim')).View,
}));
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({ hosts: [{ hostId: 'saved-host' }] }),
}));
vi.mock('../src/host/native-chat-background', () => ({
  useChatBackgrounds: () => ({ loaded: false }),
}));
vi.mock('../src/ui/chat/chat-background-editor', () => ({ ChatBackgroundEditor: () => null }));
import ConversationBackground from '../app/bot/[slug]/chat-background';
import GroupBackground from '../app/group/[id]/chat-background';
import DeviceBackground from '../app/settings/chat-background';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

for (const [name, Screen] of [
  ['DM', ConversationBackground],
  ['Group', GroupBackground],
] as const) {
  it.each([
    {},
    { hostId: 'saved-host' },
    { channelId: 'chat' },
    { hostId: 'unknown', channelId: 'chat' },
  ])(
    `${name} refuses a missing or unknown scope before loading preferences: %j`,
    async (params) => {
      route.params = params;
      const host = document.createElement('div');
      const root = createRoot(host);
      try {
        await act(async () => root.render(<Screen />));
        expect(host.querySelector('[role="alert"]')).not.toBeNull();
        expect(host.querySelector('[role="progressbar"]')).toBeNull();
      } finally {
        await act(async () => root.unmount());
      }
    },
  );
}

it('permits the parameter-free Settings editor and a scoped conversation to hydrate', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    route.params = {};
    await act(async () => root.render(<DeviceBackground />));
    expect(host.querySelector('[role="progressbar"]')).not.toBeNull();
    route.params = { hostId: 'saved-host', channelId: 'chat' };
    await act(async () => root.render(<ConversationBackground />));
    expect(host.querySelector('[role="progressbar"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});
