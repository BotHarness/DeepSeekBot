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
import type { MessagingSnapshot } from '../../core/src/messaging/outbound.js';
import type { ChannelBridgeSnapshot } from '../../core/src/messaging/channel-bridge.js';

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
  Checkbox: () => null,
  IconInfoOutlineRegular: () => null,
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
import { Combobox } from '../src/client/combobox.js';
import {
  ExternalConnectorsEntry,
  ExternalIdentitiesEntry,
} from '../src/client/external-entries.js';
import { zhTranslate } from '../src/client/locale.js';
import { useMessagingSnapshot } from '../src/client/messaging-store.js';
import { revealSidebarAnchor } from '../src/client/sidebar-anchor.js';
import { chooseOption, combobox, comboboxOption, openCombobox } from './primitive-mocks.js';

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const snapshot: MessagingSnapshot = {
  accounts: [
    {
      providerId: 'dsh-im/feishu',
      ref: 'qa',
      platform: 'feishu',
      name: 'QA Lark',
      fingerprint: 'a'.repeat(64),
      connected: true,
    },
  ],
  identities: [
    {
      id: 'binding',
      botSlug: 'ada',
      providerId: 'dsh-im/feishu',
      platform: 'feishu',
      accountRef: 'qa',
      fingerprint: 'a'.repeat(64),
      name: 'Ada on Lark',
      enabled: true,
      revision: 1,
      createdAt: '2026-10-07T00:00:00Z',
      availability: 'available',
      newConversations: 'auto',
      grantCount: 0,
      scopes: [],
    },
  ],
  grants: [],
  intents: [],
  pairings: [
    {
      id: 'request',
      reference: 'PAIR',
      botSlug: 'ada',
      bindingId: 'binding',
      accountName: 'QA Lark',
      actorId: 'ou_demo',
      conversationId: 'oc_demo',
      status: 'pending',
      capabilities: [],
      createdAt: '2026-10-07T00:00:00Z',
      expiresAt: '2026-10-07T00:10:00Z',
      revision: 1,
      attempts: 1,
    },
  ],
};

const bridges: ChannelBridgeSnapshot = {
  channelId: 'dm',
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

const actions = {
  messagingSnapshot: vi.fn(async () => snapshot),
  messagingIdentity: vi.fn(),
  messagingTargets: vi.fn(async () => []),
  pairingReview: vi.fn(),
  channelBridges: vi.fn(async () => bridges),
  channelBridge: vi.fn(),
} as unknown as BridgeActions;

const props = {
  scope: 'personabot' as const,
  channelId: 'dm',
  botSlug: 'ada',
  actions,
  t: zhTranslate,
};

it('lists Bot identities and pending pairings without a standalone platform guide', async () => {
  await act(async () => root.render(createElement(ExternalIdentitiesEntry, props)));
  const titles = [...host.querySelectorAll('.bh-card-title')].map((node) => node.textContent);
  expect(titles).toEqual([
    'Ada on Lark',
    zhTranslate('identity.bind'),
    zhTranslate('pairing.title'),
    zhTranslate('approvalIm.title'),
  ]);
  expect(host.querySelector('[role="switch"]')?.getAttribute('aria-label')).toBe(
    zhTranslate('identity.enableFor', { name: 'Ada on Lark' }),
  );
  expect(host.textContent).toContain(zhTranslate('pairing.pendingCount', { count: 1 }));
  expect(host.querySelector('[data-anchor="lark-bind"]')).not.toBeNull();
});

it('lists connectors as rows with the conversation authorization row last', async () => {
  await act(async () => root.render(createElement(ExternalConnectorsEntry, props)));
  const rows = [...host.querySelectorAll('.bh-card-row')];
  expect(rows.map((row) => row.querySelector('.bh-card-title')?.textContent)).toEqual([
    'QA intake',
    zhTranslate('im.authorizeRow'),
  ]);
  expect(rows[0]?.textContent).toContain('QA group');
  expect(rows[0]?.textContent).toContain(zhTranslate('bridge.state.receiving'));
  expect(rows[1]?.getAttribute('data-anchor')).toBe('lark-grant');
  await act(async () => rows[0]!.querySelector<HTMLButtonElement>('.bh-card-main')!.click());
  expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
    zhTranslate('bridge.edit'),
  );
});

it('expands a collapsed sidebar entry to reveal a guide anchor', async () => {
  document.body.innerHTML =
    '<div data-entry-id="external-connectors"><button aria-expanded="false">entry</button></div>';
  const head = document.querySelector('button')!;
  head.addEventListener('click', () => {
    const row = document.createElement('li');
    row.dataset.anchor = 'lark-grant';
    document.querySelector('[data-entry-id]')!.append(row);
  });
  const ready = vi.fn();
  const unavailable = vi.fn();
  revealSidebarAnchor(document, 'external-connectors', 'lark-grant', ready, unavailable);
  await act(async () => undefined);
  expect(ready).toHaveBeenCalledWith(document.querySelector('[data-anchor="lark-grant"]'));
  expect(unavailable).not.toHaveBeenCalled();
  revealSidebarAnchor(document, 'external-identities', 'lark-bind', ready, unavailable);
  expect(unavailable).toHaveBeenCalledTimes(1);
});

it('keeps disabled combobox options out of keyboard and click selection', async () => {
  const onSelect = vi.fn();
  await act(async () =>
    root.render(
      createElement(Combobox, {
        label: 'Account',
        toggleLabel: 'Account',
        value: '',
        onSelect,
        options: [
          { value: 'offline', label: 'Offline', disabled: true },
          { value: 'online', label: 'Online' },
        ],
      }),
    ),
  );
  await openCombobox('Account');
  expect(comboboxOption('offline')?.disabled).toBe(true);
  const input = combobox('Account');
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
  );
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  );
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('online');
});

it('keeps the setup action available with apps, without apps and after an unmatched search, without selecting an account', async () => {
  const onSelect = vi.fn();
  const setup = vi.fn();
  const render = async (options: { value: string; label: string }[]) => {
    await act(async () =>
      root.render(
        createElement(Combobox, {
          label: 'App',
          toggleLabel: 'App',
          value: '',
          options,
          onSelect,
          emptyLabel: 'No apps',
          action: { label: 'Add new app', onSelect: setup },
        }),
      ),
    );
    await openCombobox('App');
  };
  await render([]);
  expect(document.querySelector('[role="option"][data-action]')?.textContent).toBe('Add new app');
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[role="option"][data-action]')!.click(),
  );
  expect(setup).toHaveBeenCalledTimes(1);
  await render([{ value: 'existing', label: 'Existing app' }]);
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(2);
  const input = combobox('App');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'unmatched',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
  );
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  );
  expect(setup).toHaveBeenCalledTimes(2);
  expect(onSelect).not.toHaveBeenCalled();
});

it('clears a failed load after a successful explicit refresh', async () => {
  const messagingSnapshot = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(snapshot);
  const store = { messagingSnapshot } as unknown as BridgeActions;
  let refresh: () => Promise<void> = async () => undefined;
  function Probe() {
    const state = useMessagingSnapshot('refresh-probe', store);
    refresh = state.refresh;
    return createElement('div', { ref: state.mount }, state.failed ? 'failed' : 'ok');
  }
  await act(async () => root.render(createElement(Probe)));
  expect(host.textContent).toBe('failed');
  await act(async () => refresh());
  expect(host.textContent).toBe('ok');
});

it('returns from QR settings to the retained bind dialog with newly paired and occupied apps refreshed', async () => {
  const paired = {
    providerId: 'dsh-im/weixin',
    ref: 'new-wechat',
    platform: 'weixin',
    name: 'New WeChat',
    fingerprint: 'b'.repeat(64),
    connected: true,
  };
  const existing = {
    ...paired,
    ref: 'existing',
    name: 'Existing app',
    fingerprint: 'a'.repeat(64),
  };
  const initial: MessagingSnapshot = {
    accounts: [existing],
    identities: [],
    grants: [],
    intents: [],
  };
  let current = initial;
  const messagingSnapshot = vi.fn(async () => current);
  const store = { ...actions, messagingSnapshot };
  const trigger = document.createElement('button');
  trigger.setAttribute('aria-haspopup', 'dialog');
  document.body.prepend(trigger);
  const settings = document.createElement('div');
  settings.setAttribute('role', 'dialog');
  const nav = document.createElement('button');
  nav.textContent = 'IM机器人';
  const platform = document.createElement('button');
  platform.textContent = '飞书';
  nav.onclick = () => settings.append(platform);
  settings.append(nav);
  trigger.onclick = () => document.body.append(settings);
  await act(async () =>
    root.render(
      createElement(ExternalIdentitiesEntry, {
        ...props,
        botSlug: 'qr-return',
        actions: store,
      }),
    ),
  );
  const button = (text: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === text || b.querySelector('.bh-card-title')?.textContent === text,
    )!;
  await act(async () => button(zhTranslate('identity.bind')).click());
  const refreshButton = host.querySelector<HTMLButtonElement>('[aria-label="刷新应用"]')!;
  expect(refreshButton.textContent).toBe('');
  expect(refreshButton.parentElement?.querySelector('[role="combobox"]')).not.toBeNull();
  await chooseOption('应用', 'dsh-im/weixin:existing', host);
  expect(messagingSnapshot).toHaveBeenCalledTimes(2);
  await act(async () => button(zhTranslate('identity.manageApps')).click());
  expect(settings.isConnected).toBe(true);
  current = {
    ...initial,
    accounts: [
      existing,
      paired,
      {
        ...paired,
        ref: 'occupied',
        name: 'Shared app',
        fingerprint: 'c'.repeat(64),
        boundBotSlug: 'bea',
      },
    ],
  };
  await act(async () => settings.remove());
  expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
    zhTranslate('identity.bind'),
  );
  expect(messagingSnapshot).toHaveBeenCalledTimes(3);
  expect(combobox('应用', host).value).toBe('Existing app');
  expect(host.textContent).toContain('添加新应用');
  await openCombobox('应用', host);
  expect(comboboxOption('dsh-im/weixin:new-wechat')?.disabled).toBe(false);
  expect(comboboxOption('dsh-im/weixin:occupied')?.textContent).toContain('已绑定其他 Bot');
  expect(comboboxOption('dsh-im/weixin:occupied')?.disabled).toBe(true);
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[role="option"][data-action]')!.click(),
  );
  expect(settings.isConnected).toBe(true);
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => settings.remove());
  expect(messagingSnapshot).toHaveBeenCalledTimes(4);
  expect(combobox('应用', host).value).toBe('Existing app');
});

it('keeps a failed app refresh recoverable in the same dialog', async () => {
  const initial: MessagingSnapshot = { accounts: [], identities: [], grants: [], intents: [] };
  const messagingSnapshot = vi.fn(async () => initial);
  await act(async () =>
    root.render(
      createElement(ExternalIdentitiesEntry, {
        ...props,
        botSlug: 'refresh-retry-apps',
        actions: { ...actions, messagingSnapshot },
      }),
    ),
  );
  messagingSnapshot.mockRejectedValueOnce(new Error('Provider unavailable'));
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-anchor="lark-bind"] button')!.click(),
  );
  expect(host.querySelector('[role="dialog"] [role="alert"]')?.textContent).toBe(
    '刷新应用失败，请重试。',
  );
  messagingSnapshot.mockResolvedValueOnce({
    ...initial,
    accounts: [
      {
        providerId: 'dsh-im/weixin',
        ref: 'recovered',
        platform: 'weixin',
        name: 'Recovered WeChat',
        fingerprint: 'a'.repeat(64),
        connected: true,
      },
    ],
  });
  await act(async () =>
    [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.getAttribute('aria-label') === '刷新应用')!
      .click(),
  );
  expect(host.querySelector('[role="dialog"] [role="alert"]')).toBeNull();
  await openCombobox('应用', host);
  expect(comboboxOption('dsh-im/weixin:recovered')?.disabled).toBe(false);
});

it('does not reopen a closed bind dialog when an app refresh settles later', async () => {
  const initial: MessagingSnapshot = { accounts: [], identities: [], grants: [], intents: [] };
  const messagingSnapshot = vi.fn(async () => initial);
  await act(async () =>
    root.render(
      createElement(ExternalIdentitiesEntry, {
        ...props,
        botSlug: 'closed-refresh-apps',
        actions: { ...actions, messagingSnapshot },
      }),
    ),
  );
  let finish: (value: MessagingSnapshot) => void = () => undefined;
  messagingSnapshot.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-anchor="lark-bind"] button')!.click(),
  );
  expect(host.querySelector('[role="status"]')?.textContent).toBe('正在刷新应用…');
  const bind = [...host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (b) => b.textContent === '绑定应用',
  )!;
  expect(bind.disabled).toBe(true);
  await act(async () =>
    [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === '取消')!
      .click(),
  );
  await act(async () => finish(initial));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});

it('releases the settings return watcher when the Bot sidebar unmounts', async () => {
  const initial: MessagingSnapshot = { accounts: [], identities: [], grants: [], intents: [] };
  const messagingSnapshot = vi.fn(async () => initial);
  const trigger = document.createElement('button');
  trigger.setAttribute('aria-haspopup', 'dialog');
  const settings = document.createElement('div');
  settings.setAttribute('role', 'dialog');
  const nav = document.createElement('button');
  nav.textContent = 'IM机器人';
  settings.append(nav);
  trigger.onclick = () => document.body.append(settings);
  document.body.prepend(trigger);
  await act(async () =>
    root.render(
      createElement(ExternalIdentitiesEntry, {
        ...props,
        botSlug: 'unmounted-qr-apps',
        actions: { ...actions, messagingSnapshot },
      }),
    ),
  );
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-anchor="lark-bind"] button')!.click(),
  );
  await act(async () =>
    [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === '添加新应用')!
      .click(),
  );
  expect(settings.isConnected).toBe(true);
  expect(messagingSnapshot).toHaveBeenCalledTimes(2);
  await act(async () => root.render(createElement('div')));
  await act(async () => settings.remove());
  expect(messagingSnapshot).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});
