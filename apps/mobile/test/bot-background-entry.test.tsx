// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));

const push = vi.hoisted(() => vi.fn());
vi.mock('expo-router', () => ({
  useIsFocused: () => true,
  useRouter: () => ({ push }),
  useFocusEffect: () => {},
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
  }),
}));
vi.mock('../src/ui/chat/dm-activity-settings', () => ({ DmActivitySettings: () => null }));
vi.mock('../src/ui/chat/bot-name-setting', () => ({ BotNameSetting: () => null }));
vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));

import { createHostClient } from '../src/host/client';
import { BotSettingsPanel } from '../src/ui/chat/bot-settings-panel';
import { t } from '../src/ui/strings';
import { FakeHost } from './fake-host';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => push.mockReset());

it.each([undefined, 'dm-existing'])(
  'opens the DM background even before a DM id is cached: %s',
  async (dmChannelId) => {
    const fake = new FakeHost();
    fake.methods.set('channelDm', () => ({ channel: { id: 'dm-created' } }));
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
