// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RosterView } from '../src/host/client';

const push = vi.fn();
const roster: RosterView = {
  bots: [
    {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      computerAccess: false,
      browserAccess: false,
      state: 'idle',
      paused: false,
      dmChannelId: 'dm-ada',
      preview: 'Done',
    },
    {
      slug: 'xiaoming',
      displayName: '小明',
      roles: [],
      computerAccess: false,
      browserAccess: false,
      state: 'idle',
      paused: false,
    },
  ],
  channels: [{ id: 'launch-team', name: 'Launch team', memberCount: 3, members: [] }],
};

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('expo-router', () => {
  const Stack = () => null;
  Stack.Screen = () => null;
  return { Redirect: () => null, Stack, useRouter: () => ({ push }) };
});
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({
    saved: { hostId: 'h1', hostName: 'studio' },
    client: undefined,
    inbox: undefined,
  }),
  useHostSnapshot: () => ({ connection: { status: 'connected', route: '' }, roster }),
  useInbox: () => ({ status: 'loading' }),
}));
vi.mock('../src/host/native-section-collapse', () => ({
  sectionCollapse: { toggle: () => {} },
  useCollapsedSections: () => new Set(),
}));
vi.mock('../src/host/native-host-look', () => ({
  useHostLook: () => ({ avatar: { kind: 'initial' }, banner: { kind: 'accent' } }),
}));
vi.mock('../src/ui/chat/section-header', () => ({ SectionHeader: () => null }));
vi.mock('../src/ui/shell/home-header', () => ({
  HomeHeader: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/ui/shell/host-drawer', () => ({
  HostDrawerEdge: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/ui/shell/human-avatar', () => ({ HumanAvatarButton: () => null }));
vi.mock('../src/ui/connection-banner', () => ({ ConnectionBanner: () => null }));
vi.mock('../src/ui/bot-avatar', () => ({ BotAvatar: () => null }));

import HomeScreen from '../app/(tabs)/(home)/index';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  push.mockReset();
});

async function home(): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<HomeScreen />));
  return host;
}

async function type(view: HTMLElement, text: string): Promise<void> {
  const field = view.querySelector<HTMLTextAreaElement>(
    `textarea[aria-label="${t.searchPlaceholder}"]`,
  )!;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')!.set!;
  await act(async () => {
    setter.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const rows = (view: HTMLElement) =>
  [...view.querySelectorAll('button')].map((node) => node.getAttribute('aria-label'));

describe('Search at the top of Chats', () => {
  it('filters the list in place and opens the chat the Human taps', async () => {
    const view = await home();
    expect(rows(view)).toHaveLength(3);

    await type(view, 'AD');
    expect(rows(view)).toEqual(['Ada, Done']);
    await act(async () => view.querySelector('button')!.click());
    expect(push).toHaveBeenLastCalledWith({ pathname: '/dm/[slug]', params: { slug: 'ada' } });

    await type(view, '小明');
    expect(rows(view)).toEqual(['小明']);

    await type(view, 'launch');
    await act(async () => view.querySelector('button')!.click());
    expect(push).toHaveBeenLastCalledWith({
      pathname: '/channel/[id]',
      params: { id: 'launch-team' },
    });
  });

  it('says plainly when nothing matches', async () => {
    const view = await home();
    await type(view, ' zed ');
    expect(rows(view)).toEqual([]);
    expect(view.textContent).toContain(t.searchNoMatch('zed'));
  });
});
