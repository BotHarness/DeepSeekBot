// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  Button: ({
    variant: _variant,
    size: _size,
    icon: _icon,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
    icon?: unknown;
  }) => createElement('button', props),
  Tag: ({ children }: PropsWithChildren) => createElement('span', { className: 'tag' }, children),
  Switch: ({
    checked,
    onChange,
    label,
  }: {
    checked: boolean;
    onChange(value: boolean): void;
    label: string;
  }) =>
    createElement('input', {
      type: 'checkbox',
      'aria-label': label,
      checked,
      onChange: () => onChange(!checked),
    }),
  Tooltip: ({ children }: PropsWithChildren) => children,
  Modal: () => null,
  Menu: () => null,
  IconCheckOutlineRegular: () => null,
  IconCloseOutlineRegular: () => null,
  IconRefreshOutlineRegular: () => null,
  IconEllipsisOutlineRegular: () => null,
  relativeTime: () => ({ unit: 'now', n: 0 }),
}));

import type { BridgeActions } from '../src/client/actions.js';
import { zhTranslate } from '../src/client/locale.js';
import type { PrivateAccountList } from '../src/client/private-accounts.js';
import { PrivateAccountsSection } from '../src/client/private-accounts-section.js';

const CARD = '11111111-1111-4111-8111-111111111111';
const row = {
  account: 'synthetic',
  purpose: 'Check the controlled service',
  fields: [
    { id: 'api_key', label: 'API key', required: true },
    { id: 'private_url', label: 'Private URL', required: false },
  ],
  status: 'configured' as const,
  configuredAt: '2026-10-12T00:00:00.000Z',
  channelId: 'dm-ada',
  messageId: CARD,
};

let root: Root;
let host: HTMLDivElement;
let list: PrivateAccountList;
let actions: BridgeActions;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  list = { status: 'ready', accounts: [row], replaceable: true };
  actions = {
    privateAccounts: vi.fn(async () => list),
    privateInputReplace: vi.fn(async () => '22222222-2222-4222-8222-222222222222'),
    privateAccountRevoke: vi.fn(async () => ({
      accepted: true,
      stopped: 1,
      completed: 0,
      uncertain: 0,
    })),
    openChannelAtMessage: vi.fn(async () => undefined),
  } as unknown as BridgeActions;
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const render = () =>
  act(async () =>
    root.render(
      createElement(PrivateAccountsSection, {
        scope: 'personabot',
        channelId: 'dm-ada',
        botSlug: 'ada',
        actions,
        t: zhTranslate,
      }),
    ),
  );
const button = (label: string) =>
  [...host.querySelectorAll('button')].find((candidate) => candidate.textContent === label)!;

it('lists secrets with purpose, status and configured time, then replaces and removes through the card IDs', async () => {
  await render();
  expect(actions.privateAccounts).toHaveBeenCalledWith('ada');
  const card = host.querySelector('.bh-card-row')!;
  expect(card.querySelector('.bh-card-title')?.textContent).toBe('synthetic');
  expect(card.textContent).toContain(zhTranslate('privateAccounts.status.configured'));
  const lines = [...card.querySelectorAll('.bh-card-meta-line')].map((line) => line.textContent);
  expect(lines[0]).toBe('用途：Check the controlled service');
  expect(lines[1]).toBe('字段：API key · Private URL（可选）');
  expect(lines[2]).toMatch(/^配置时间：/);

  await act(async () => button(zhTranslate('privateInput.replace')).click());
  expect(actions.privateInputReplace).toHaveBeenCalledWith('dm-ada', CARD);

  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await act(async () => button(zhTranslate('privateAccounts.remove')).click());
  expect(confirm.mock.calls[0]?.[0]).toBe(
    zhTranslate('privateAccounts.removeConfirm', { account: 'synthetic' }),
  );
  expect(actions.privateAccountRevoke).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  list = { status: 'ready', accounts: [], replaceable: true };
  await act(async () => button(zhTranslate('privateAccounts.remove')).click());
  expect(actions.privateAccountRevoke).toHaveBeenCalledWith('dm-ada', CARD);
  expect(host.textContent).toContain(
    zhTranslate('privateInput.stopSummary', { stopped: 1, completed: 0, uncertain: 0 }),
  );
  expect(host.querySelector('.bh-card-row')).toBeNull();
  expect(host.textContent).toContain(zhTranslate('privateAccounts.empty'));
});

it('lists remembered MCP servers and removes one after confirmation', async () => {
  const remove = vi.fn(async () => true);
  (actions as unknown as { privateMcpServerRemove: typeof remove }).privateMcpServerRemove = remove;
  list = {
    status: 'ready',
    accounts: [],
    replaceable: true,
    mcpServers: [
      {
        serverName: 'github',
        account: 'GitHub token',
        program: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        approvedAt: '2026-10-13T00:00:00.000Z',
        connected: true,
        ownerName: 'Ada',
        own: true,
        enabled: true,
      },
    ],
  };
  await render();
  expect(host.textContent).toContain(zhTranslate('privateAccounts.mcpTitle'));
  const card = host.querySelector('.bh-card-row')!;
  expect(card.querySelector('.bh-card-title')?.textContent).toBe('github');
  expect(card.textContent).toContain(zhTranslate('privateAccounts.mcpConnected'));
  expect(card.textContent).toContain('npx -y @modelcontextprotocol/server-github');
  expect(card.textContent).toContain('GitHub token');
  expect(card.textContent).toContain(zhTranslate('privateAccounts.mcpShared'));
  expect(card.querySelector('input[type=checkbox]')).toBeNull();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await act(async () => button(zhTranslate('privateAccounts.mcpRemove')).click());
  expect(remove).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  list = { status: 'ready', accounts: [], replaceable: true, mcpServers: [] };
  await act(async () => button(zhTranslate('privateAccounts.mcpRemove')).click());
  expect(remove).toHaveBeenCalledWith('ada', 'github');
  expect(host.querySelector('.bh-card-row')).toBeNull();
});

it('lets another Bot enable a server that a different Bot set up', async () => {
  const enable = vi.fn(async () => true);
  (actions as unknown as { privateMcpServerEnable: typeof enable }).privateMcpServerEnable = enable;
  const server = {
    serverName: 'github',
    account: 'GitHub token',
    program: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    approvedAt: '2026-10-13T00:00:00.000Z',
    connected: false,
    ownerName: 'Bob',
    own: false,
    enabled: false,
  };
  list = { status: 'ready', accounts: [], replaceable: true, mcpServers: [server] };
  await render();
  const card = host.querySelector('.bh-card-row')!;
  expect(card.textContent).toContain(zhTranslate('privateAccounts.mcpSharedBy', { bot: 'Bob' }));
  const toggle = card.querySelector('input[type=checkbox]') as HTMLInputElement;
  expect(toggle.checked).toBe(false);
  list = {
    status: 'ready',
    accounts: [],
    replaceable: true,
    mcpServers: [{ ...server, enabled: true, connected: true }],
  };
  await act(async () => toggle.click());
  expect(enable).toHaveBeenCalledWith('ada', 'github', true);
  expect((host.querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(true);
});

it('disables Replace when execution is off and keeps Remove', async () => {
  list = { status: 'ready', accounts: [row], replaceable: false };
  await render();
  expect(button(zhTranslate('privateInput.replace')).disabled).toBe(true);
  expect(button(zhTranslate('privateAccounts.remove')).disabled).toBe(false);
  expect(host.textContent).toContain(zhTranslate('privateAccounts.locked'));
});

it('says the list cannot be read instead of showing it as empty', async () => {
  list = { status: 'unavailable', accounts: [], replaceable: false };
  await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    zhTranslate('privateAccounts.unavailable'),
  );
  expect(host.textContent).not.toContain(zhTranslate('privateAccounts.empty'));
});
