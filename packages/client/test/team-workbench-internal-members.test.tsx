// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fakeTeamMode } from '../../host-client/test/reader-fixtures.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { TeamWorkbench } from '../src/client/team-workbench.js';

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
  vi.unstubAllGlobals();
});

const roles = [
  {
    roleId: 'member',
    name: 'member',
    builtin: 'member',
    permissions: [],
    denied: [],
    revision: 1,
  },
  { roleId: 'leads', name: 'Leads', builtin: null, permissions: [], denied: [], revision: 1 },
];

const bob = {
  humanId: 'bob',
  username: 'bob',
  displayName: 'Bob',
  status: 'active',
  roleIds: ['member'],
};

function teamHost(initial: { enabled: boolean; memberSettings?: unknown }) {
  let mode = {
    ...fakeTeamMode(),
    ownerPasswordSet: true,
    memberUrls: ['https://host.test/team/'],
    ...initial,
  };
  const call = vi.fn<BridgeCall>(async (method, args) => {
    if (method === 'teamMode') return { ok: true, value: mode };
    if (method === 'teamModeSet') {
      mode = { ...mode, enabled: args['enabled'] === true };
      return { ok: true, value: mode };
    }
    if (method === 'teamMemberSettingsSet') {
      const settings = {
        inviteLifetimeMinutes: 10,
        defaultRoleId: 'member',
        ...(mode.memberSettings as object | undefined),
        ...args,
      };
      mode = { ...mode, memberSettings: settings };
      return { ok: true, value: settings };
    }
    if (method === 'roles') return { ok: true, value: roles };
    if (method === 'permissionCatalog') return { ok: true, value: [] };
    if (method === 'members') return { ok: true, value: [bob] };
    throw new Error(method);
  });
  return call;
}

function sent(call: ReturnType<typeof teamHost>, method: string): unknown[] {
  return call.mock.calls.filter(([name]) => name === method).map(([, args]) => args);
}

const nav = (id: string) => host.querySelector<HTMLButtonElement>(`[data-team-nav="${id}"]`);

it('shows the off state with the switch and hides internal roles and Channels', async () => {
  const call = teamHost({ enabled: false });
  await act(async () => root.render(<TeamWorkbench call={call} t={zhTranslate} />));
  expect(nav('members')?.textContent).toContain('未开启');
  expect(nav('roles')).toBeNull();
  expect(nav('channels')).toBeNull();
  const off = host.querySelector('[data-team-members-off]');
  expect(off?.textContent).toContain('开启内部成员模式后');
  const toggle = off!.querySelector<HTMLButtonElement>('[role="switch"]');
  await act(async () => toggle!.click());
  expect(sent(call, 'teamModeSet')).toContainEqual({ enabled: true });
  expect(host.querySelector('[data-team-members-off]')).toBeNull();
  expect(nav('members')?.textContent).not.toContain('未开启');
  expect(nav('roles')).not.toBeNull();
  expect(nav('channels')).not.toBeNull();
});

it('copies the invite link and shows the unset member settings defaults without saving', async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  const call = teamHost({
    enabled: true,
    memberSettings: { inviteLifetimeMinutes: 10, defaultRoleId: 'member' },
  });
  await act(async () => root.render(<TeamWorkbench call={call} t={zhTranslate} />));
  const copy = host.querySelector<HTMLButtonElement>('[data-team-copy-invite]');
  expect(copy?.textContent).toBe('复制邀请链接');
  await act(async () => copy!.click());
  expect(writeText).toHaveBeenCalledWith('https://host.test/team/');
  expect(copy?.textContent).toBe('已复制');
  expect(host.querySelector('[data-team-invite-member]')?.textContent).toBe('邀请成员');

  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-team-member-settings-open]')!.click(),
  );
  const page = host.querySelector('[data-team-member-settings]');
  expect(page?.textContent).toContain('内部成员设置');
  const lifetime = page!.querySelector<HTMLInputElement>('[data-team-invite-lifetime]')!;
  expect(lifetime.value).toBe('10');
  expect(page?.querySelector('[data-team-row="default-role"]')?.textContent).toContain('成员');
  expect(sent(call, 'teamMemberSettingsSet')).toEqual([]);

  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(lifetime, '30');
    lifetime.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    lifetime.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  );
  expect(sent(call, 'teamMemberSettingsSet')).toContainEqual({ inviteLifetimeMinutes: 30 });
  expect(host.querySelector<HTMLInputElement>('[data-team-invite-lifetime]')?.value).toBe('30');

  await act(async () => host.querySelector<HTMLButtonElement>('[data-team-back]')!.click());
  expect(host.querySelector('[data-team-member-settings]')).toBeNull();
});

it('turns internal member mode off from the settings page after confirming', async () => {
  const call = teamHost({ enabled: true });
  await act(async () => root.render(<TeamWorkbench call={call} t={zhTranslate} />));
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-team-member-settings-open]')!.click(),
  );
  expect(host.querySelector('[data-team-member-settings]')?.textContent).toContain(
    '这台 Host 的版本较旧',
  );
  await act(async () => host.querySelector<HTMLButtonElement>('[data-team-mode-off]')!.click());
  expect(sent(call, 'teamModeSet')).not.toContainEqual({ enabled: false });
  const confirm = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === '关闭' && button.closest('[role="dialog"]') !== null,
  );
  await act(async () => confirm!.click());
  expect(sent(call, 'teamModeSet')).toContainEqual({ enabled: false });
  expect(host.querySelector('[data-team-members-off]')).not.toBeNull();
});
