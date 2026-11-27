// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fakeTeamMode } from '../../host-client/test/reader-fixtures.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { TeamWorkbench, choiceOf, groupCatalog, withChoice } from '../src/client/team-workbench.js';
import type { TeamRole } from '../src/client/team-roles-bridge.js';
import { resolveSection, visibleSections } from '../src/client/team-workbench/sections.js';

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
    revision: 1,
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
    { roleId: 'leads', expectedRevision: 1, permissions: [], denied: ['channels.create'] },
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

it('reloads a member picked while a save is pending once the save lands', async () => {
  let current = role();
  let releaseSave: () => void = () => undefined;
  let loads = 0;
  const call = vi.fn<BridgeCall>(async (method, args) => {
    if (method === 'teamMode') return { ok: true, value: fakeTeamMode() };
    if (method === 'roles') return { ok: true, value: [current] };
    if (method === 'permissionCatalog') return { ok: true, value: catalog };
    if (method === 'members')
      return {
        ok: true,
        value: [
          {
            humanId: 'alice',
            username: 'alice',
            displayName: 'Alice',
            status: 'active',
            roleIds: ['member', 'leads'],
          },
        ],
      };
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
      loads++;
      return {
        ok: true,
        value: {
          humanId: 'alice',
          owner: false,
          active: true,
          permissions: [
            {
              id: 'channels.create',
              state: current.denied.includes('channels.create') ? 'denied' : 'granted',
              sources: [],
            },
          ],
        },
      };
    }
    throw new Error(method);
  });
  await act(async () => root.render(<TeamWorkbench call={call} t={zhTranslate} />));
  await act(async () => {
    segment('channels.create', '拒绝').click();
  });
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-team-holder="alice"]')!.click(),
  );
  const effective = () =>
    host.querySelector<HTMLElement>('[data-team-effective-permission="channels.create"]');
  expect(effective()?.dataset['state']).toBe('granted');
  await act(async () => releaseSave());
  expect(loads).toBe(2);
  expect(effective()?.dataset['state']).toBe('denied');
});

it('derives visible sections from the viewer and defaults to the roles section', () => {
  const owner = { ...fakeTeamMode(), enabled: true } as never;
  const context = { view: owner, roles: [role()], members: [] };
  expect(visibleSections(context).map((section) => section.id)).toEqual([
    'members',
    'channels',
    'roles',
  ]);
  expect(resolveSection(context, undefined)?.id).toBe('roles');
  expect(resolveSection(context, 'channels')?.id).toBe('channels');
  const member = {
    ...fakeTeamMode({ kind: 'member', humanId: 'ann', permissions: [] }),
    enabled: true,
  } as never;
  expect(
    visibleSections({ view: member, roles: [], members: [] }).map((section) => section.id),
  ).toEqual(['channels']);
  expect(resolveSection({ view: member, roles: [], members: [] }, 'roles')?.id).toBe('channels');
});

it('opens a member from the members section and shows their effective permissions', async () => {
  const call = vi.fn<BridgeCall>(async (method) => {
    if (method === 'teamMode') return { ok: true, value: fakeTeamMode() };
    if (method === 'roles') return { ok: true, value: [role()] };
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
    if (method === 'memberPermissions')
      return {
        ok: true,
        value: {
          humanId: 'bob',
          owner: false,
          active: true,
          permissions: [{ id: 'channels.create', state: 'granted', sources: [] }],
        },
      };
    throw new Error(method);
  });
  await act(async () => root.render(<TeamWorkbench call={call} t={zhTranslate} />));
  const nav = host.querySelector<HTMLButtonElement>('[data-team-nav="members"]');
  expect(nav?.textContent).toContain('内部成员');
  await act(async () => nav!.click());
  expect(host.querySelector('[data-team-member-detail]')).toBeNull();
  const row = host.querySelector<HTMLButtonElement>('[data-team-member="bob"]');
  expect(row?.textContent).toContain('Leads');
  await act(async () => row!.click());
  expect(host.querySelector('[data-team-member-detail="bob"]')).not.toBeNull();
  expect(
    host.querySelector<HTMLElement>('[data-team-effective-permission="channels.create"]')?.dataset[
      'state'
    ],
  ).toBe('granted');
});

it('filters channels by visibility and shows the channel tabs with counts', async () => {
  const channels = [
    {
      id: 'g1',
      type: 'group',
      name: 'Lobby',
      members: ['bot-a'],
      humanMembers: [{ humanId: 'h1', displayName: 'Ann' }],
    },
    { id: 'g2', type: 'group', name: 'Secret', members: [], humanMembers: [] },
    { id: 'dm-a', type: 'dm', name: 'Helper', members: ['bot-a'], botSlug: 'bot-a' },
  ];
  const access = (visibility: string) => ({
    role: 'owner',
    visibility: { kind: visibility },
    policy: { version: 1, everyone: {}, overrides: [] },
    admins: [],
  });
  const call = vi.fn<BridgeCall>(async (method, args) => {
    if (method === 'teamMode') return { ok: true, value: { ...fakeTeamMode(), enabled: true } };
    if (method === 'roles') return { ok: true, value: [role()] };
    if (method === 'permissionCatalog') return { ok: true, value: catalog };
    if (method === 'members') return { ok: true, value: [] };
    if (method === 'channels') return { ok: true, value: { channels } };
    if (method === 'channelGet') {
      const channel = channels.find((item) => item.id === args['channelId']);
      return {
        ok: true,
        value: { channel, ...access(channel?.id === 'g2' ? 'private' : 'public') },
      };
    }
    throw new Error(method);
  });
  await act(async () => root.render(<TeamWorkbench call={call} t={zhTranslate} />));
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-team-nav="channels"]')!.click(),
  );
  expect(host.querySelectorAll('[data-team-channel]')).toHaveLength(2);
  expect(host.querySelector('[data-team-channel="g1"]')?.textContent).toContain('Helper');
  const tabs = [...host.querySelectorAll('[data-team-channel-detail] [role="tab"]')].map(
    (node) => node.textContent,
  );
  expect(tabs).toEqual(['成员 1', 'Bot 1', '权限']);
  expect(host.querySelector('[data-team-channel-bot="bot-a"]')?.textContent).toBe('Helper');
  const privateTab = [
    ...host.querySelectorAll<HTMLButtonElement>('[data-team-list] [role="tab"]'),
  ].find((node) => node.textContent === '仅受邀者');
  await act(async () => privateTab!.click());
  expect(
    [...host.querySelectorAll('[data-team-channel]')].map((node) =>
      node.getAttribute('data-team-channel'),
    ),
  ).toEqual(['g2']);
  expect(host.querySelector('[data-team-channel-detail="g2"]')?.textContent).toContain(
    '这个频道还没有成员',
  );
});

it('shows the no-access state when the viewer cannot open any section', async () => {
  const call = vi.fn<BridgeCall>(async (method) => {
    if (method === 'teamMode')
      return { ok: true, value: fakeTeamMode({ kind: 'member', humanId: 'ann' }) };
    throw new Error(method);
  });
  await act(async () => root.render(<TeamWorkbench call={call} t={zhTranslate} />));
  expect(host.textContent).toContain('只有能管理角色的人可以打开 Team');
  expect(host.querySelector('[data-team-nav]')).toBeNull();
});

it('keeps a stale role save unsaved, says so and reloads the latest role', async () => {
  let current = role();
  let rolesReads = 0;
  const call = vi.fn<BridgeCall>(async (method) => {
    if (method === 'teamMode') return { ok: true, value: fakeTeamMode() };
    if (method === 'roles') {
      rolesReads++;
      return { ok: true, value: [current] };
    }
    if (method === 'permissionCatalog') return { ok: true, value: catalog };
    if (method === 'members') return { ok: true, value: [] };
    if (method === 'roleUpdate') {
      current = { ...current, permissions: ['channels.create', 'members.manage'], revision: 2 };
      return { ok: false, error: { code: 'stale-role', message: 'stale', details: {} } };
    }
    throw new Error(method);
  });
  await act(async () => root.render(<TeamWorkbench call={call} t={zhTranslate} />));
  await act(async () => segment('channels.create', '拒绝').click());
  const note = () => host.querySelector<HTMLElement>('[data-team-role-conflict]');
  expect(note()?.dataset['teamRoleConflict']).toBe('stale');
  expect(note()?.textContent).toContain('你的修改没有保存');
  expect(note()?.textContent).toContain('创建频道 → 拒绝');
  expect(segment('channels.create', '允许').getAttribute('aria-selected')).toBe('true');
  const reads = rolesReads;
  await act(async () => host.querySelector<HTMLButtonElement>('[data-team-role-reload]')!.click());
  expect(rolesReads).toBe(reads + 1);
  expect(note()?.dataset['teamRoleConflict']).toBe('reloaded');
  expect(note()?.textContent).toContain('创建频道 → 拒绝');
  expect(segment('members.manage', '允许').getAttribute('aria-selected')).toBe('true');
});
