// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  IconChevronDownOutlineRegular: () => null,

  IconChevronRightOutlineRegular: () => null,
}));

import {
  createChannelSidebarRegistry,
  resolveChannelSidebarContext,
} from '../src/client/channel-sidebar.js';
import {
  ChannelSidebar,
  useChannelSidebar,
  type ChannelSidebarController,
} from '../src/client/channel-sidebar-view.js';
import { createChannelSidebarPrefs } from '../src/client/channel-sidebar-prefs.js';
import { createStore, type ChannelSummary, type ClientState } from '../src/client/store.js';
import type { BridgeActions } from '../src/client/actions.js';
import { zhTranslate } from '../src/client/locale.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const channels: ChannelSummary[] = [
  { id: 'dm-ada', type: 'dm', name: 'Ada', botSlug: 'ada', members: ['ada'] },
  { id: 'dm-grace', type: 'dm', name: 'Grace', botSlug: 'grace', members: ['grace'] },
  { id: 'group', type: 'group', name: 'Team', members: ['ada', 'grace'] },
].map((channel) => ({
  ...channel,
  type: channel.type === 'dm' ? 'dm' : 'group',
  createdAt: '2026-10-11T00:00:00Z',
  updatedAt: '2026-10-11T00:00:00Z',
}));
const mounted: { root: Root; host: HTMLDivElement }[] = [];
afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

function harness() {
  const store = createStore();
  store.setRoster([], channels);
  const prefs = createChannelSidebarPrefs({ getItem: () => null, setItem: () => {} });
  const registry = createChannelSidebarRegistry();
  for (const scope of ['personabot', 'channel'] as const) {
    registry.register({
      id: scope,
      label: scope,
      scope,
      component: () => null,
      badge: (props) =>
        createElement(
          'span',
          { 'data-scope': props.scope },
          `${props.channelId}:${props.botSlug ?? 'none'}`,
        ),
    });
  }
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  let controller: ChannelSidebarController;
  function View({ state }: { state: ClientState }) {
    controller = useChannelSidebar(state, prefs);
    return createElement(ChannelSidebar, {
      state,
      controller,
      registry,
      actions: { refreshBotInbox: vi.fn() } as unknown as BridgeActions,
      t: zhTranslate,
    });
  }
  return {
    store,
    prefs,
    host,
    render() {
      act(() => root.render(createElement(View, { state: store.getSnapshot() })));
      return controller!;
    },
  };
}

describe('Channel sidebar selected conversation', () => {
  it('uses PersonaBot entries and identity for a DM opened by channel ID', () => {
    const view = harness();
    view.store.select({ kind: 'channel', channelId: 'dm-ada' });
    expect(view.render().scopeKey).toBe('personabot:ada');
    expect(view.host.querySelector('[data-scope="personabot"]')?.textContent).toBe('dm-ada:ada');
    expect(view.host.querySelector('[data-scope="channel"]')).toBeNull();
  });

  it('shares collapsed and expanded preferences with Bot and Profile navigation', () => {
    const view = harness();
    view.prefs.setSidebarCollapsed('personabot:ada', true);
    view.prefs.setEntryExpanded('personabot:ada', 'personabot', true);
    view.store.select({ kind: 'channel', channelId: 'dm-ada' });
    expect(view.render().mode).toBe('hidden');
    expect(view.render().isEntryExpanded('personabot')).toBe(true);
    view.store.select({ kind: 'bot', slug: 'ada', profile: true });
    expect(view.render().scopeKey).toBe('personabot:ada');
    expect(view.render().mode).toBe('hidden');
  });

  it('ignores stale DM metadata when selecting a group or a different Bot', () => {
    const view = harness();
    view.store.select({ kind: 'channel', channelId: 'group' });
    view.store.setConversation({ channel: channels[0] });
    expect(view.render().scopeKey).toBe('channel:group');
    expect(view.host.querySelector('[data-scope="channel"]')?.textContent).toBe('group:none');
    view.store.select({ kind: 'bot', slug: 'grace' });
    view.store.setConversation({ channel: channels[0] });
    expect(view.render().scopeKey).toBe('personabot:grace');
    expect(view.host.querySelector('[data-scope="personabot"]')?.textContent).toBe(
      'dm-grace:grace',
    );
  });

  it('hides the sidebar without a conversation selection', () => {
    const view = harness();
    expect(view.render().scopeKey).toBeUndefined();
    expect(view.host.textContent).toBe('');
  });

  it('keeps known Bot scope before DM metadata arrives without guessing a missing Channel Bot', () => {
    const view = harness();
    view.store.setRoster([], []);
    view.store.select({ kind: 'bot', slug: 'ada' });
    expect(resolveChannelSidebarContext(view.store.getSnapshot())).toEqual({
      channel: undefined,
      scope: 'personabot',
      botSlug: 'ada',
      scopeKey: 'personabot:ada',
    });
    view.store.select({ kind: 'channel', channelId: 'unloaded' });
    expect(resolveChannelSidebarContext(view.store.getSnapshot())).toEqual({
      channel: undefined,
      scope: 'channel',
      botSlug: undefined,
      scopeKey: 'channel:unloaded',
    });
  });
});
