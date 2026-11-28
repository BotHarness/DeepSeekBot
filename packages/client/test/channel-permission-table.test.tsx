// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChannelPermissionTable } from '../src/client/channel-permission-table.js';
import { zhTranslate } from '../src/client/locale.js';
import { DEFAULT_POLICY, type ChannelPolicy } from '../src/client/team-channels-bridge.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

const roles = [
  { roleId: 'support', name: 'Support' },
  { roleId: 'dev', name: 'Dev' },
];

const policy: ChannelPolicy = {
  ...DEFAULT_POLICY,
  approvalMode: 'channel',
  overrides: [{ roleId: 'support', actions: { addBots: 'allow' } }],
};

function cell(key: string, column: string): HTMLButtonElement {
  const node = host.querySelector<HTMLButtonElement>(
    `[data-permission-cell="${key}:${column}"] button`,
  );
  if (!node) throw new Error(`Missing cell ${key}:${column}`);
  return node;
}

function menuItem(label: string): HTMLElement {
  const item = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]'),
  ].find((node) => node.textContent?.includes(label));
  if (!item) throw new Error(`Missing menu item ${label}`);
  return item;
}

async function render(onChange: (next: ChannelPolicy) => void, disabled = false) {
  await act(async () =>
    root.render(
      <ChannelPermissionTable
        t={zhTranslate}
        policy={policy}
        roles={roles}
        disabled={disabled}
        onChange={onChange}
      />,
    ),
  );
}

it('lays out actions as rows and roles as columns with named state cells', async () => {
  await render(() => undefined);
  const headers = [...host.querySelectorAll('thead th')].map((node) => node.textContent);
  expect(headers[0]).toBe('操作');
  expect(headers[1]).toBe('所有成员');
  expect(headers[2]).toBe('Support');
  expect(host.querySelectorAll('tbody tr')).toHaveLength(8);
  expect(cell('post', 'everyone').getAttribute('aria-label')).toBe('谁能发消息 · 所有成员 · 允许');
  expect(cell('addBots', 'support').getAttribute('aria-label')).toBe(
    '谁能添加 Bot · Support · 允许',
  );
  expect(cell('post', 'support').getAttribute('aria-label')).toBe(
    '谁能发消息 · Support · 跟随「所有成员」',
  );
  expect(cell('post', 'support').closest('td')?.dataset['state']).toBe('inherit');
});

it('changes a cell from its menu and keeps the policy shape', async () => {
  const onChange = vi.fn();
  await render(onChange);
  await act(async () => cell('mentionAll', 'support').click());
  expect(cell('mentionAll', 'support').getAttribute('aria-expanded')).toBe('true');
  await act(async () => menuItem('拒绝').click());
  expect(onChange).toHaveBeenCalledWith({
    ...policy,
    overrides: [{ roleId: 'support', actions: { addBots: 'allow', mentionAll: 'deny' } }],
  });
});

it('opens a cell menu from the keyboard', async () => {
  await render(() => undefined);
  const button = cell('post', 'everyone');
  button.focus();
  expect(document.activeElement).toBe(button);
  await act(async () => {
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    button.click();
  });
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(menuItem('继承')).toBeTruthy();
});

it('adds a role column and removes one from its header menu', async () => {
  const onChange = vi.fn();
  await render(onChange);
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-permission-add-role]')!.click(),
  );
  await act(async () => menuItem('Dev').click());
  expect(onChange).toHaveBeenLastCalledWith({
    ...policy,
    overrides: [...policy.overrides, { roleId: 'dev', actions: {} }],
  });
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-permission-column="support"] button')!.click(),
  );
  await act(async () => menuItem('移除角色').click());
  expect(onChange).toHaveBeenLastCalledWith({ ...policy, overrides: [] });
});

it('shows a read-only table without role controls when editing is not allowed', async () => {
  await render(() => undefined, true);
  expect(host.querySelector('[data-permission-add-role]')).toBeNull();
  expect(host.querySelector('[data-permission-column="support"] button')).toBeNull();
  expect(cell('post', 'everyone').disabled).toBe(true);
});

it('locks the approval rows for someone who cannot change approval rules', async () => {
  await act(async () =>
    root.render(
      <ChannelPermissionTable
        t={zhTranslate}
        policy={policy}
        roles={roles}
        disabled={false}
        approvalLocked
        onChange={() => undefined}
      />,
    ),
  );
  expect(cell('seeApprovals', 'everyone').disabled).toBe(true);
  expect(cell('decideApprovals', 'support').disabled).toBe(true);
  expect(cell('post', 'everyone').disabled).toBe(false);
  expect(cell('decideApprovals', 'everyone').getAttribute('aria-label')).toBe(
    '谁能在这里审批 · 所有成员 · 拒绝',
  );
});

it('keeps a role with approval rules from being removed by someone who cannot change them', async () => {
  await act(async () =>
    root.render(
      <ChannelPermissionTable
        t={zhTranslate}
        policy={{
          ...policy,
          overrides: [{ roleId: 'support', actions: { addBots: 'allow', seeApprovals: 'allow' } }],
        }}
        roles={roles}
        disabled={false}
        approvalLocked
        onChange={() => undefined}
      />,
    ),
  );
  expect(host.querySelector('[data-permission-column="support"] button')).toBeNull();
  expect(host.querySelector('[data-permission-column="support"]')?.textContent).toBe('Support');
});

it('shows a legacy channel approval rows as the original behavior instead of table cells', async () => {
  await act(async () =>
    root.render(
      <ChannelPermissionTable
        t={zhTranslate}
        policy={{ ...policy, approvalMode: 'legacy' }}
        roles={roles}
        disabled={false}
        onChange={() => undefined}
      />,
    ),
  );
  const row = host.querySelector<HTMLElement>('[data-permission-action="seeApprovals"]');
  expect(row?.dataset['state']).toBe('legacy');
  expect(row?.textContent).toContain('沿用原来的审批方式');
  expect(host.querySelector('[data-permission-cell^="decideApprovals:"]')).toBeNull();
  expect(cell('post', 'everyone').disabled).toBe(false);
});
