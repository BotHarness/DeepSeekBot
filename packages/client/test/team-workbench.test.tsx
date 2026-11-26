// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fakeTeamMode } from '../../host-client/test/reader-fixtures.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { TeamWorkbench, choiceOf, groupCatalog, withChoice } from '../src/client/team-workbench.js';
import type { TeamRole } from '../src/client/team-roles-bridge.js';

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
});

const catalog = [
  { id: 'members.manage', group: 'members' },
  { id: 'roles.manage', group: 'members' },
  { id: 'channels.create', group: 'channels' },
  { id: 'bots.createPrivate', group: 'bots' },
  { id: 'approvals.opaqueTools', group: 'oversight' },
  { id: 'privateContent.view', group: 'oversight' },
];

function role(overrides: Partial<TeamRole> = {}): TeamRole {
  return {
    roleId: 'leads',
    name: 'Leads',
    builtin: null,
    permissions: ['channels.create'],
    denied: [],
    models: { kind: 'all' },
    memberCount: 1,
    policy: [],
    policyRevision: 1,
    ...overrides,
  };
}

function capability(id: string): HTMLElement {
  const node = host.querySelector<HTMLElement>(`[data-team-capability="${id}"]`);
  if (!node) throw new Error(`Missing capability ${id}`);
  return node;
}

function segment(id: string, label: string): HTMLButtonElement {
  const match = [...capability(id).querySelectorAll('button')].find(
    (node) => node.textContent === label,
  );
  if (!match) throw new Error(`Missing ${label} for ${id}`);
  return match;
}

it('groups the catalog the way the workbench presents it and keeps unknown ids', () => {
  expect(
    groupCatalog([...catalog, { id: 'future.permission', group: 'members' }] as never).map(
      ([group, ids]) => [group, [...ids]],
    ),
  ).toEqual([
    ['membersRoles', ['members.manage', 'roles.manage']],
    ['create', ['bots.createPrivate', 'channels.create']],
    ['oversight', ['approvals.opaqueTools', 'privateContent.view']],
    ['other', ['future.permission']],
  ]);
});

it('moves a permission between allow, unset and deny without keeping it on both lists', () => {
  const base = role({ permissions: ['channels.create', 'usage.view'], denied: ['audit.view'] });
  expect(choiceOf(base, 'channels.create')).toBe('allow');
  expect(choiceOf(base, 'audit.view')).toBe('deny');
  expect(choiceOf(base, 'roles.manage')).toBe('unset');
  expect(withChoice(base, 'channels.create', 'deny')).toEqual({
    permissions: ['usage.view'],
    denied: ['audit.view', 'channels.create'],
  });
  expect(withChoice(base, 'audit.view', 'unset')).toEqual({
    permissions: ['channels.create', 'usage.view'],
    denied: [],
  });
});

it('denies a capability for a role and shows where a member gets each permission', async () => {
  let current = role();
  const call = vi.fn<BridgeCall>(async (method, args) => {
    if (method === 'teamMode') return { ok: true, value: fakeTeamMode() };
    if (method === 'roles') return { ok: true, value: [current] };
    if (method === 'permissionCatalog') return { ok: true, value: catalog };
    if (method === 'members')
      return {
        ok: true,
        value: [
          {
            humanId: 'bob',
            username: 'bob',
            displayName: 'Bob',
            status: 'active',
            roleIds: ['member', 'leads'],
          },
        ],
      };
    if (method === 'roleUpdate') {
      current = {
        ...current,
        permissions: args['permissions'],
        denied: args['denied'],
      } as TeamRole;
      return { ok: true, value: { role: current } };
    }
    if (method === 'memberPermissions')
      return {
        ok: true,
        value: {
          humanId: 'bob',
          owner: false,
          active: true,
          permissions: [
            {
              id: 'channels.create',
              state: 'denied',
              sources: [
                { roleId: 'leads', name: 'Leads', builtin: null, effect: 'deny' },
                { roleId: 'member', name: 'member', builtin: 'member', effect: 'allow' },
              ],
            },
          ],
        },
      };
    throw new Error(method);
  });
  await act(async () => root.render(<TeamWorkbench call={call} t={zhTranslate} />));

  expect(host.querySelector('[data-team-role-detail="leads"]')).not.toBeNull();
  expect(segment('channels.create', '允许').getAttribute('aria-selected')).toBe('true');
  expect(capability('approvals.opaqueTools').textContent).toContain('高风险');

  await act(async () => segment('channels.create', '拒绝').click());
  expect(call).toHaveBeenCalledWith(
    'roleUpdate',
    { roleId: 'leads', permissions: [], denied: ['channels.create'] },
    undefined,
  );
  expect(segment('channels.create', '拒绝').getAttribute('aria-selected')).toBe('true');

  await act(async () => host.querySelector<HTMLButtonElement>('[data-team-holder="bob"]')!.click());
  const effective = host.querySelector<HTMLElement>(
    '[data-team-effective-permission="channels.create"]',
  );
  expect(effective?.dataset['state']).toBe('denied');
  expect(effective?.textContent).toContain('Leads拒绝');
  expect(effective?.textContent).toContain('成员允许');
  expect(effective?.textContent).toContain('角色冲突');
});

it('keeps Owner-only permissions locked for a delegated role manager', async () => {
  const call = vi.fn<BridgeCall>(async (method) => {
    if (method === 'teamMode')
      return {
        ok: true,
        value: fakeTeamMode({
          kind: 'member',
          humanId: 'ann',
          permissions: ['roles.manage', 'channels.create'],
        }),
      };
    if (method === 'roles') return { ok: true, value: [role()] };
    if (method === 'permissionCatalog') return { ok: true, value: catalog };
    return { ok: true, value: [] };
  });
  await act(async () => root.render(<TeamWorkbench call={call} t={zhTranslate} />));
  expect(segment('privateContent.view', '允许').disabled).toBe(true);
  expect(capability('privateContent.view').textContent).toContain('只有所有者能授予');
  expect(segment('bots.createPrivate', '允许').disabled).toBe(true);
  expect(segment('channels.create', '拒绝').disabled).toBe(false);
});

it('retries loading the workbench after a failed load', async () => {
  let failing = true;
  const call = vi.fn<BridgeCall>(async (method) => {
    if (method === 'teamMode') return { ok: true, value: fakeTeamMode() };
    if (method === 'roles') {
      if (failing) throw new Error('offline');
      return { ok: true, value: [role()] };
    }
    if (method === 'permissionCatalog') return { ok: true, value: catalog };
    return { ok: true, value: [] };
  });
  await act(async () => root.render(<TeamWorkbench call={call} t={zhTranslate} />));
  const retry = host.querySelector<HTMLButtonElement>('[data-team-retry]');
  expect(retry?.textContent).toBe('重试');
  failing = false;
  await act(async () => retry!.click());
  expect(host.querySelector('[data-team-retry]')).toBeNull();
  expect(host.querySelector('[data-team-role-detail="leads"]')).not.toBeNull();
});

it('keeps a member inspection closed when the role changes during a save', async () => {
  let current = role();
  let release: () => void = () => undefined;
  const call = vi.fn<BridgeCall>(async (method, args) => {
    if (method === 'teamMode') return { ok: true, value: fakeTeamMode() };
    if (method === 'roles')
      return { ok: true, value: [current, role({ roleId: 'interns', name: 'Interns' })] };
    if (method === 'permissionCatalog') return { ok: true, value: catalog };
    if (method === 'members')
      return {
        ok: true,
        value: [
          {
            humanId: 'bob',
            username: 'bob',
            displayName: 'Bob',
            status: 'active',
            roleIds: ['member', 'leads'],
          },
        ],
      };
    if (method === 'roleUpdate') {
      await new Promise<void>((resolve) => (release = resolve));
      current = {
        ...current,
        permissions: args['permissions'],
        denied: args['denied'],
      } as TeamRole;
      return { ok: true, value: { role: current } };
    }
    if (method === 'memberPermissions')
      return { ok: true, value: { humanId: 'bob', owner: false, active: true, permissions: [] } };
    throw new Error(method);
  });
  await act(async () => root.render(<TeamWorkbench call={call} t={zhTranslate} />));
  await act(async () => host.querySelector<HTMLButtonElement>('[data-team-holder="bob"]')!.click());
  expect(host.querySelector('[data-team-effective="bob"]')).not.toBeNull();

  await act(async () => segment('channels.create', '拒绝').click());
  await act(async () => host.querySelector<HTMLElement>('[data-team-role="interns"]')!.click());
  await act(async () => release());
  expect(host.querySelector('[data-team-effective="bob"]')).toBeNull();
  expect(call.mock.calls.filter(([method]) => method === 'memberPermissions')).toHaveLength(1);
});

it('reloads the member being selected when a save lands during their load', async () => {
  let current = role({ memberCount: 2 });
  let releaseAlice: () => void = () => undefined;
  let aliceLoads = 0;
  let releaseSave: () => void = () => undefined;
  const holder = (humanId: string) => ({
    humanId,
    username: humanId,
    displayName: humanId,
    status: 'active',
    roleIds: ['member', 'leads'],
  });
  const call = vi.fn<BridgeCall>(async (method, args) => {
    if (method === 'teamMode') return { ok: true, value: fakeTeamMode() };
    if (method === 'roles') return { ok: true, value: [current] };
    if (method === 'permissionCatalog') return { ok: true, value: catalog };
    if (method === 'members') return { ok: true, value: [holder('bob'), holder('alice')] };
    if (method === 'roleUpdate') {
      await new Promise<void>((resolve) => (releaseSave = resolve));
      current = {
        ...current,
        permissions: args['permissions'],
        denied: args['denied'],
      } as TeamRole;
      return { ok: true, value: { role: current } };
    }
    if (method === 'memberPermissions') {
      const humanId = String(args['humanId']);
      if (humanId === 'alice' && aliceLoads++ === 0)
        await new Promise<void>((resolve) => (releaseAlice = resolve));
      return { ok: true, value: { humanId, owner: false, active: true, permissions: [] } };
    }
    throw new Error(method);
  });
  await act(async () => root.render(<TeamWorkbench call={call} t={zhTranslate} />));
  await act(async () => host.querySelector<HTMLButtonElement>('[data-team-holder="bob"]')!.click());
  expect(host.querySelector('[data-team-effective="bob"]')).not.toBeNull();

  await act(async () => {
    host.querySelector<HTMLButtonElement>('[data-team-holder="alice"]')!.click();
  });
  await act(async () => segment('channels.create', '拒绝').click());
  await act(async () => releaseAlice());
  expect(host.querySelector('[data-team-effective="alice"]')).not.toBeNull();
  await act(async () => releaseSave());
  expect(host.querySelector('[data-team-effective="bob"]')).toBeNull();
  expect(host.querySelector('[data-team-effective="alice"]')).not.toBeNull();
});
