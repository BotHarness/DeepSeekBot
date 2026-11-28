// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const opened = vi.hoisted(() => vi.fn(() => true));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('expo-router', () => ({ useNavigationContainerRef: () => ({}) }));
vi.mock('../src/host/host-session', () => ({ useHostSessions: () => [] }));
vi.mock('../src/ui/shell/open-conversation', () => ({ openConversation: opened }));
vi.mock('../src/ui/primitives/settings-row', () => ({
  SettingsRow: (props: {
    title: string;
    testID?: string;
    trailing?: ReactNode;
    onPress?: () => void;
  }) =>
    createElement(
      'div',
      { 'data-testid': props.testID },
      createElement('button', { type: 'button', onClick: props.onPress }, props.title),
      props.trailing,
    ),
}));
vi.mock('../src/ui/primitives/button', () => ({
  Button: (props: { label: string; testID?: string; disabled?: boolean; onPress(): void }) =>
    createElement(
      'button',
      {
        type: 'button',
        'data-testid': props.testID,
        disabled: props.disabled === true,
        onClick: props.onPress,
      },
      props.label,
    ),
}));

import type { RosterView } from '@botharness/host-client/client';
import { conversations, hiddenConversations, titleOf } from '../src/ui/chat/conversations';
import { HiddenChats } from '../src/ui/chat/hidden-chats-screen';
import { t } from '../src/ui/strings';

const roster = (hidden: string[]): RosterView =>
  ({
    bots: [{ slug: 'ada', displayName: 'Ada', dmChannelId: 'dm-ada', roles: [] }],
    channels: [
      { id: 'lobby', name: 'Lobby', memberCount: 3, members: [] },
      { id: 'studio', name: 'Studio', memberCount: 3, members: [] },
    ],
    people: [],
    arrangement: { pins: [], hidden, sections: [], sectionOrder: [] },
  }) as unknown as RosterView;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

it('moves hidden chats out of Chats and lists them by name for restoring', () => {
  const view = roster(['studio', 'dm-ada']);
  expect(conversations(view, []).map(titleOf)).toEqual(['Lobby']);
  expect(hiddenConversations(view).map(titleOf)).toEqual(['Ada', 'Studio']);
  expect(hiddenConversations(roster([]))).toEqual([]);
});

it('unhides one chat through the Host hidden roster and opens a hidden chat on tap', async () => {
  let hidden = ['studio', 'dm-ada'];
  const call = vi.fn(async (method: string, args?: Record<string, unknown>) => {
    if (method === 'rosterGet') return { pins: [], hidden, sections: [], sectionOrder: [] };
    hidden = args?.['hidden'] as string[];
    return { hidden };
  });
  const refresh = vi.fn(async () => undefined);
  const client = { call, refresh } as never;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<HiddenChats hostId="h1" client={client} roster={roster(hidden)} />));
  const unhide = host.querySelector<HTMLButtonElement>(
    '[data-testid="hidden-chat-unhide-channel:studio"]',
  )!;
  expect(unhide.textContent).toBe(t.hiddenChats.unhide);
  await act(async () => unhide.click());
  expect(call).toHaveBeenCalledWith('hiddenSet', { hidden: ['dm-ada'] });
  expect(refresh).toHaveBeenCalledOnce();
  act(() =>
    host!.querySelector<HTMLButtonElement>('[data-testid="hidden-chat-bot:ada"] button')!.click(),
  );
  expect(opened).toHaveBeenCalledWith({}, expect.objectContaining({ key: 'bot:ada' }), 'h1');
  act(() => root!.render(<HiddenChats hostId="h1" client={client} roster={roster([])} />));
  expect(host.textContent).toContain(t.hiddenChats.empty);
});
