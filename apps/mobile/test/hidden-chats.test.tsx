// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/host/host-session', () => ({ useHostSessions: () => [] }));
vi.mock('../src/ui/primitives/settings-row', () => ({
  SettingsRow: (props: { title: string; testID?: string; trailing?: ReactNode }) =>
    createElement('div', { 'data-testid': props.testID }, props.title, props.trailing),
}));
vi.mock('../src/ui/primitives/button', () => ({
  Button: (props: {
    label: string;
    testID?: string;
    disabled?: boolean;
    fit?: boolean;
    onPress(): void;
  }) =>
    createElement(
      'button',
      {
        type: 'button',
        'data-testid': props.testID,
        'data-fit': String(props.fit === true),
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

it('unhides one chat through the Host hidden roster', async () => {
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
  act(() => root!.render(<HiddenChats client={client} roster={roster(hidden)} />));
  const unhide = host.querySelector<HTMLButtonElement>(
    '[data-testid="hidden-chat-unhide-channel:studio"]',
  )!;
  expect(unhide.textContent).toBe(t.hiddenChats.unhide);
  expect(unhide.getAttribute('data-fit')).toBe('true');
  await act(async () => unhide.click());
  expect(call).toHaveBeenCalledWith('hiddenSet', { hidden: ['dm-ada'] });
  expect(refresh).toHaveBeenCalledOnce();
  act(() => root!.render(<HiddenChats client={client} roster={roster([])} />));
  expect(host.textContent).toContain(t.hiddenChats.empty);
});
