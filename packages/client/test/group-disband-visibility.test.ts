// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const team = vi.hoisted(() => ({ viewer: { kind: 'owner' as 'owner' | 'member' } }));

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
}));

vi.mock('../src/client/team-state.js', () => ({
  useTeamMode: () => ({ enabled: true, viewer: team.viewer }),
}));

import type { BridgeActions } from '../src/client/actions.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { zhTranslate } from '../src/client/locale.js';
import { store, type ChannelSummary } from '../src/client/store.js';

const AT = '2026-11-26T00:00:00Z';
const GROUP: ChannelSummary = {
  id: 'g-launch',
  type: 'group',
  name: 'Launch',
  members: ['ada'],
  createdAt: AT,
  updatedAt: AT,
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  store.setRoster([], [GROUP]);
  store.setConversation({ channel: GROUP });
});

afterEach(async () => {
  await act(async () => root.unmount());
  store.setConversation({ channel: undefined });
  store.setRoster([], []);
  document.body.replaceChildren();
  team.viewer = { kind: 'owner' };
  vi.unstubAllGlobals();
});

async function renderHeader(): Promise<void> {
  const entry = createChannelSidebarBuiltins(zhTranslate).find(
    (item) => item.id === 'group-management',
  )!;
  const HeaderAction = entry.headerAction!;
  await act(async () =>
    root.render(
      createElement(HeaderAction, {
        scope: 'channel',
        channelId: GROUP.id,
        botSlug: undefined,
        actions: { teamCall: vi.fn() } as unknown as BridgeActions,
        t: zhTranslate,
      }),
    ),
  );
}

const moreButton = () =>
  document.body.querySelector(`button[aria-label="${zhTranslate('group.more')}"]`);

it('offers the Owner the Disband group menu in the Group profile header', async () => {
  await renderHeader();
  expect(moreButton()).not.toBeNull();
  await act(async () => (moreButton() as HTMLButtonElement).click());
  expect(document.body.textContent).toContain(zhTranslate('members.delete'));
});

it('hides Disband group from a Team member', async () => {
  team.viewer = { kind: 'member' };
  await renderHeader();
  expect(moreButton()).toBeNull();
  expect(document.body.textContent).not.toContain(zhTranslate('members.delete'));
});

it('hides Disband group on a remote member Web Client page', async () => {
  vi.stubGlobal('__DSH_REMOTE_ACCESS__', { owner: false });
  await renderHeader();
  expect(moreButton()).toBeNull();
});
