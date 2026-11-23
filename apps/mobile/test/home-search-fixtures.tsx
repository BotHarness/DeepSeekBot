import { act } from 'react';
import { Platform } from 'react-native';
import { vi } from 'vitest';
import { conversationFilter } from '../src/host/native-conversation-filter';
import { sectionCollapse } from '../src/host/native-section-collapse';
import { t } from '../src/ui/strings';
import {
  push,
  cloudState,
  directoryState,
  hostState,
  call,
  refresh,
  menus,
  rowProps,
  roster,
  whoami,
} from './home-search-mocks';

export const rowCalls = () => call.mock.calls.filter(([method]) => method !== 'messageSearch');

export async function rowMenuAction(view: HTMLElement, key: keyof typeof t.rowActions) {
  if (Platform.OS === 'ios') {
    const row = view.querySelector('[data-testid="conversation-row-bot:ada"]')!;
    const menu = row.parentElement!.querySelector('[data-testid="native-context-menu"]')!;
    const action = [...menu.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === t.rowActions[key],
    )!;
    await act(async () => action.click());
  } else {
    await act(async () => (rowProps.get('conversation-row-bot:ada')!.onLongPress as () => void)());
    await act(async () =>
      menus.at(-1)!.find((action) => action.text === t.rowActions[key])!.onPress!(),
    );
  }
}

export const rows = (view: HTMLElement) =>
  [...view.querySelectorAll('button')]
    .filter((node) => node.dataset.testid !== 'action-menu-trigger')
    .filter((node) => node.dataset.testid !== 'chats-view-button')
    .filter((node) => !node.dataset.testid?.startsWith('chat-section-'))
    .filter((node) => !node.closest('[hidden]') && !node.dataset.testid?.startsWith('pager-'))
    .filter(
      (node) =>
        ![
          t.cloudJoin.newOrJoin,
          t.allEnvironments,
          'studio',
          t.closeSearch,
          t.openSearch,
          t.openTobMode,
          t.settings,
          t.workspaces,
        ].includes(node.getAttribute('aria-label') ?? ''),
    )
    .map((node) => node.getAttribute('aria-label'));

export function prepareHomeState() {
  whoami.mockReset();
  vi.stubGlobal(
    'requestIdleCallback',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelIdleCallback', vi.fn());
}

export function resetHomeState() {
  push.mockReset();
  vi.unstubAllGlobals();
  hostState.live?.stop();
  hostState.live = undefined;
  hostState.connecting = false;
  hostState.removed = false;
  hostState.color = undefined;
  hostState.fontScale = 1;
  hostState.actions = false;
  hostState.unread = false;
  hostState.activityItems = [];
  hostState.hostId = 'h1';
  delete roster.bots[0]!.latestMessageId;
  delete roster.arrangement;
  delete roster.sorting;
  for (const id of ['h1', 'h2', JSON.stringify(['view', 'all'])])
    for (const section of sectionCollapse.collapsed(id)) sectionCollapse.toggle(id, section);
  call.mockClear();
  refresh.mockClear();
  menus.length = 0;
  rowProps.clear();
  Platform.OS = 'web';
  conversationFilter.set('all');
  cloudState.live = undefined;
  cloudState.rows = [];
  cloudState.ready = true;
  cloudState.error = undefined;
  directoryState.rows = [];
  directoryState.workspaces = [];
  directoryState.live = undefined;
  directoryState.busy = false;
  directoryState.ready = true;
  directoryState.errors = [];
}
