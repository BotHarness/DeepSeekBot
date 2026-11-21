// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));

const { push, feature } = vi.hoisted(() => ({ push: vi.fn(), feature: { available: false } }));
vi.mock('../src/marketplace/available', () => ({
  get marketplaceAvatarsAvailable() {
    return feature.available;
  },
}));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push }),
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/ui/shell/icons', async () => ({
  ...(await import('./shell-icons-shim')),
  ChevronRightIcon: () => null,
  CpuIcon: () => null,
  FolderIcon: () => null,
}));
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({ saved: { hostId: 'studio' } }),
}));
vi.mock('../src/ui/chat/composer-context', () => ({
  useComposerContext: () => ({
    model: { status: 'loading' },
    grants: { status: 'loading' },
    reloadModel: () => {},
  }),
}));
vi.mock('../src/ui/chat/dm-activity-settings', () => ({ DmActivitySettings: () => null }));
vi.mock('../src/ui/chat/bot-name-setting', () => ({ BotNameSetting: () => null }));
vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));

import { createHostClient } from '@botharness/host-client/client';
import { BotSettingsPanel } from '../src/ui/chat/bot-settings-panel';
import { t } from '../src/ui/strings';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  push.mockReset();
  feature.available = false;
});

it.each([undefined, 'dm-existing'])(
  'opens the DM background even before a DM id is cached: %s',
  async (dmChannelId) => {
    const fake = new FakeHost();
    fake.methods.set('channelDm', () => ({
      channel: { id: 'dm-created', type: 'dm', name: 'Ada', members: ['ada'] },
    }));
    const client = createHostClient({
      routes: ['https://studio.tailnet-example.ts.net'],
      credential: fake.credential,
      carrier: fake.carrier,
    });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <BotSettingsPanel
            client={client}
            bot={{
              slug: 'ada',
              displayName: 'Ada',
              roles: [],
              state: 'idle',
              paused: false,
              computerAccess: false,
              browserAccess: false,
              ...(dmChannelId === undefined ? {} : { dmChannelId }),
            }}
          />,
        ),
      );
      const entry = host.querySelector<HTMLButtonElement>('[data-testid="bot-chat-background"]')!;
      expect(entry.getAttribute('aria-label')).toBe(t.chatBackground.title);
      await act(async () => entry.click());
      expect(push).toHaveBeenCalledWith({
        pathname: '/bot/[slug]/chat-background',
        params: { slug: 'ada', hostId: 'studio', channelId: dmChannelId ?? 'dm-created' },
      });
      expect(fake.calls.filter((call) => call.method === 'botAvatarSet')).toHaveLength(0);
      expect(fake.calls.filter((call) => call.method === 'channelDm')).toHaveLength(
        dmChannelId === undefined ? 1 : 0,
      );
    } finally {
      await act(async () => root.unmount());
      host.remove();
      client.stop();
    }
  },
);

it.each([false, true])(
  'gates Publish Avatar for a Bot with a stored Avatar: %s',
  async (available) => {
    feature.available = available;
    const fake = new FakeHost();
    const client = createHostClient({
      routes: ['https://studio.tailnet-example.ts.net'],
      credential: fake.credential,
      carrier: fake.carrier,
    });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <BotSettingsPanel
            client={client}
            bot={{
              slug: 'ada',
              displayName: 'Ada',
              avatarUrl: 'https://studio.tailnet-example.ts.net/avatar.png',
              roles: [],
              state: 'idle',
              paused: false,
              computerAccess: false,
              browserAccess: false,
            }}
          />,
        ),
      );
      const entry = host.querySelector<HTMLButtonElement>(
        '[data-testid="marketplace-avatar-publish-from-bot"]',
      );
      expect(entry !== null).toBe(available);
      if (entry) {
        await act(async () => entry.click());
        expect(push).toHaveBeenCalledWith({
          pathname: '/marketplace-avatar-editor',
          params: { hostId: 'studio', bot: 'ada' },
        });
      } else {
        expect(push).not.toHaveBeenCalled();
      }
    } finally {
      await act(async () => root.unmount());
      host.remove();
      client.stop();
    }
  },
);
