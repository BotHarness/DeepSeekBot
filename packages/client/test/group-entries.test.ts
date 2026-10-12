// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GroupMemberWakePolicy } from '../../core/src/channels/channel.js';
import type { ChannelBridgeSnapshot } from '../../core/src/messaging/channel-bridge.js';
import type { ConversationIngestSnapshot } from '../../core/src/messaging/conversation-ingest.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  Button: ({
    variant: _variant,
    size: _size,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) =>
    createElement('button', props),
  Tag: ({ children }: PropsWithChildren) => createElement('span', { className: 'tag' }, children),
  Switch: ({ label, checked }: { label: string; checked: boolean }) =>
    createElement('button', { role: 'switch', 'aria-label': label, 'aria-checked': checked }),
  Menu: () => null,
  IconEllipsisOutlineRegular: () => null,
  Tooltip: ({ children }: PropsWithChildren) => children,
  Modal: ({
    open,
    title,
    children,
    footer,
  }: PropsWithChildren<{ open: boolean; title: string; footer?: ReactNode }>) =>
    open ? createElement('div', { role: 'dialog', 'aria-label': title }, children, footer) : null,
}));

import type { BridgeActions } from '../src/client/actions.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { GroupConnectorsEntry, GroupWakePolicyEntry } from '../src/client/group-entries.js';
import { zhTranslate } from '../src/client/locale.js';
import { store, type ChannelSummary } from '../src/client/store.js';

const AT = '2026-10-08T00:00:00Z';

const GROUP: ChannelSummary = {
  id: 'g-qa',
  type: 'group',
  name: 'QA 群',
  members: ['ada', 'bob'],
  createdAt: AT,
  updatedAt: AT,
};

const policies: GroupMemberWakePolicy[] = [
  {
    botSlug: 'ada',
    inherited: true,
    policy: {
      mode: 'digest',
      count: 5,
      intervalSeconds: 30,
      revision: 0,
      lastActor: null,
      changedAt: null,
    },
  },
  {
    botSlug: 'bob',
    inherited: false,
    policy: {
      mode: 'mentions',
      count: 5,
      intervalSeconds: 30,
      revision: 2,
      lastActor: null,
      changedAt: null,
    },
    externals: [
      {
        platform: 'feishu',
        policy: { mode: 'all', count: 5, intervalSeconds: 30, revision: 1 },
        origin: 'channel',
        defaultRevision: 0,
      },
    ],
  },
];

const bridges: ChannelBridgeSnapshot = {
  channelId: GROUP.id,
  sources: [],
  bridges: [
    {
      grantId: 'grant',
      grantRevision: 1,
      botSlug: 'ada',
      platform: 'feishu',
      accountName: 'QA Lark',
      conversationName: 'QA group',
      ordinaryDelivery: 'verified',
      name: 'QA intake',
      enabled: true,
      collection: 'mentions',
      revision: 1,
      availability: 'available',
      reception: 'receiving',
    },
  ],
};

const ingests: ConversationIngestSnapshot = { channelId: GROUP.id, ingests: [], candidates: [] };

let root: Root;
let host: HTMLDivElement;
let actions: BridgeActions;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  store.setRoster(
    [
      { slug: 'ada', displayName: 'Ada', roles: [], aggregateState: 'idle', createdAt: AT },
      { slug: 'bob', displayName: 'Bob', roles: [], aggregateState: 'idle', createdAt: AT },
    ] as never,
    [GROUP],
  );
  actions = {
    groupWakePolicies: vi.fn(async () => policies),
    setGroupWakePolicy: vi.fn(async () => true),
    channelBridges: vi.fn(async () => bridges),
    channelBridge: vi.fn(),
    channelIngests: vi.fn(async () => ingests),
    channelIngest: vi.fn(),
  } as unknown as BridgeActions;
});

afterEach(async () => {
  await act(async () => root.unmount());
  store.setRoster([], []);
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function props() {
  return {
    scope: 'channel' as const,
    channelId: GROUP.id,
    botSlug: undefined,
    actions,
    t: zhTranslate,
  };
}

it('lists one wake card per member Bot and edits it in a dialog', async () => {
  await act(async () => root.render(createElement(GroupWakePolicyEntry, props())));
  const rows = [...host.querySelectorAll('.bh-card-row')];
  expect(rows.map((row) => row.querySelector('.bh-card-title')?.textContent)).toEqual([
    'Ada',
    'Bob',
  ]);
  expect(rows[0]?.querySelector('.tag')).toBeNull();
  expect(rows[1]?.querySelector('.tag')?.textContent).toBe(zhTranslate('groupWake.custom'));
  expect(rows[1]?.querySelector('.bh-card-meta-line')?.textContent).toContain(
    zhTranslate('members.wake.all'),
  );

  await act(async () => rows[1]!.querySelector<HTMLButtonElement>('.bh-card-main')!.click());
  const dialog = host.querySelector('[role="dialog"]');
  expect(dialog?.getAttribute('aria-label')).toBe(
    zhTranslate('members.policy.title', { bot: 'Bob' }),
  );
  const silent = [...dialog!.querySelectorAll('button')].find(
    (button) => button.textContent === zhTranslate('members.wake.silent'),
  )!;
  await act(async () => silent.click());
  const save = [...dialog!.querySelectorAll('button')].find(
    (button) => button.textContent === zhTranslate('members.wake.save'),
  )!;
  await act(async () => save.click());
  expect(actions.setGroupWakePolicy).toHaveBeenCalledWith(GROUP.id, 'bob', {
    mode: 'silent',
    count: 5,
    intervalSeconds: 30,
  });
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(actions.groupWakePolicies).toHaveBeenCalledTimes(2);
});

it('lists the group connectors as card rows that open the edit dialog', async () => {
  await act(async () => root.render(createElement(GroupConnectorsEntry, props())));
  expect(actions.channelBridges).toHaveBeenCalledWith(GROUP.id);
  expect(actions.channelIngests).toHaveBeenCalledWith(GROUP.id);
  const row = host.querySelector('.bh-card-row')!;
  expect(row.querySelector('.bh-card-title')?.textContent).toBe('QA intake');
  await act(async () => row.querySelector<HTMLButtonElement>('.bh-card-main')!.click());
  expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
    zhTranslate('bridge.edit'),
  );
});

it('renders nothing for a channel that is not a group', async () => {
  await act(async () =>
    root.render(createElement(GroupWakePolicyEntry, { ...props(), channelId: 'missing' })),
  );
  expect(host.textContent).toBe('');
  expect(actions.groupWakePolicies).not.toHaveBeenCalled();
});

it('registers both group entries between members and group management, shown only in groups', () => {
  const entries = createChannelSidebarBuiltins(zhTranslate)
    .filter((entry) => entry.scope === 'channel')
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  expect(entries.map((entry) => entry.id)).toEqual([
    'group-work',
    'members',
    'group-wake-policy',
    'group-external-connectors',
    'group-management',
  ]);
  const wake = entries[2]!;
  store.setConversation({ channel: GROUP });
  expect(wake.visible?.(store.getSnapshot())).toBe(true);
  store.setConversation({ channel: { ...GROUP, id: 'dm', type: 'dm' } });
  expect(wake.visible?.(store.getSnapshot())).toBe(false);
  store.setConversation({ channel: undefined });
});
