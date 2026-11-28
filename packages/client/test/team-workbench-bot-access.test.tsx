// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BotAccessRolesView, RoleBotScopeView } from '@botharness/host-client/team-roles';
import { fakeTeamMode } from '../../host-client/test/reader-fixtures.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { TeamWorkbench } from '../src/client/team-workbench.js';
import type { TeamRole } from '../src/client/team-roles-bridge.js';
import {
  RoleBotScope,
  draftChanged,
  savedDraft,
  scopeRow,
} from '../src/client/team-workbench/role-bot-scope.js';

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

const leads: TeamRole = {
  roleId: 'leads',
  name: 'Leads',
  builtin: null,
  permissions: [],
  denied: [],
  models: { kind: 'all' },
  memberCount: 1,
  policy: [],
  policyRevision: 1,
  revision: 3,
};

function scope(overrides: Partial<RoleBotScopeView> = {}): RoleBotScopeView {
  return {
    roleId: 'leads',
    revision: 3,
    editableBotsRevision: 'editable-bots-v1',
    kind: 'selected',
    canSetAll: true,
    canSetSelected: true,
    bots: [
      {
        slug: 'lobby',
        displayName: 'Lobby',
        selected: false,
        editable: false,
        source: 'everyone',
        audience: 'everyone',
        availableToMembers: true,
      },
      {
        slug: 'dispatch',
        displayName: 'Dispatch',
        selected: false,
        editable: true,
        source: 'none',
        audience: 'roles',
        availableToMembers: true,
      },
      {
        slug: 'vip',
        displayName: 'VIP',
        selected: false,
        editable: false,
        source: 'none',
        audience: 'members',
        availableToMembers: true,
      },
    ],
    ...overrides,
  };
}

function row(slug: string): HTMLElement {
  const node = host.querySelector<HTMLElement>(`[data-team-bot-scope-bot="${slug}"]`);
  if (!node) throw new Error(`Missing Bot row ${slug}`);
  return node;
}

function toggle(slug: string): HTMLButtonElement {
  return row(slug).querySelector<HTMLButtonElement>('[role="switch"]')!;
}

function mode(label: string): HTMLButtonElement {
  const match = [
    ...host.querySelectorAll<HTMLButtonElement>(
      '[data-team-bot-scope] [role="tab"], [data-team-bot-scope] button',
    ),
  ].find((node) => node.textContent === label);
  if (!match) throw new Error(`Missing ${label}`);
  return match;
}

function save(): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>('[data-team-bot-scope-save]');
}

it('locks rows the role cannot change and says why', () => {
  const view = scope();
  const draft = savedDraft(view);
  expect(scopeRow(view, draft, view.bots[0]!)).toEqual({
    on: true,
    editable: false,
    reason: 'team.workbench.botScope.reason.everyone',
  });
  expect(scopeRow(view, draft, view.bots[1]!)).toEqual({
    on: false,
    editable: true,
    reason: undefined,
  });
  expect(scopeRow(view, draft, view.bots[2]!).reason).toBe(
    'team.workbench.botScope.reason.members',
  );
  expect(scopeRow(view, { kind: 'all', slugs: new Set() }, view.bots[1]!)).toEqual({
    on: true,
    editable: false,
    reason: 'team.workbench.botScope.reason.all',
  });
  const locked = scope({ canSetSelected: false });
  expect(scopeRow(locked, savedDraft(locked), locked.bots[1]!).reason).toBeUndefined();
  const foreign = scope({
    bots: [{ ...view.bots[1]!, editable: false, selected: true }],
  });
  expect(scopeRow(foreign, savedDraft(foreign), foreign.bots[0]!)).toEqual({
    on: true,
    editable: false,
    reason: 'team.workbench.botScope.reason.manage',
  });
  expect(draftChanged(view, draft)).toBe(false);
  expect(draftChanged(view, { kind: 'selected', slugs: new Set(['dispatch']) })).toBe(true);
  expect(draftChanged(view, { kind: 'all', slugs: draft.slugs })).toBe(true);
});

async function renderRoles(call: BridgeCall): Promise<void> {
  await act(async () => root.render(<TeamWorkbench call={call} t={zhTranslate} />));
  const nav = host.querySelector<HTMLButtonElement>('[data-team-nav="roles"]');
  if (!nav) throw new Error('Missing roles nav');
  await act(async () => nav.click());
}

function workbench(handlers: Record<string, (args: Record<string, unknown>) => unknown>) {
  return vi.fn<BridgeCall>(async (method, args) => {
    if (method === 'teamMode') return { ok: true, value: { ...fakeTeamMode(), enabled: true } };
    if (method === 'roles') return { ok: true, value: [leads] };
    if (method === 'permissionCatalog') return { ok: true, value: [] };
    if (method === 'members') return { ok: true, value: [] };
    const handler = handlers[method];
    if (handler) return handler(args) as never;
    throw new Error(method);
  });
}

it('saves the selected Bots only after an explicit save and switches to all Bots on request', async () => {
  let current = scope();
  const call = workbench({
    roleBotScope: () => ({ ok: true, value: current }),
    roleBotScopeSet: (args) => {
      const next = args['scope'] as { kind: 'all' } | { kind: 'selected'; botSlugs: string[] };
      current = {
        ...current,
        revision: current.revision + 1,
        kind: next.kind,
        bots: current.bots.map((bot) =>
          bot.editable && next.kind === 'selected'
            ? { ...bot, selected: next.botSlugs.includes(bot.slug) }
            : bot,
        ),
      };
      return { ok: true, value: current };
    },
  });
  await renderRoles(call);

  expect(host.textContent).toContain('私有 Bot 只属于它的负责人，不受这里的设置影响。');
  expect(toggle('lobby').disabled).toBe(true);
  expect(row('lobby').textContent).toContain('对所有成员开放');
  expect(toggle('vip').disabled).toBe(true);
  expect(row('vip').textContent).toContain('只开放给点名的成员');
  expect(save()).toBeNull();

  await act(async () => toggle('dispatch').click());
  expect(call).not.toHaveBeenCalledWith('roleBotScopeSet', expect.anything(), undefined);
  await act(async () => save()!.click());
  expect(call).toHaveBeenCalledWith(
    'roleBotScopeSet',
    {
      roleId: 'leads',
      expectedRevision: 3,
      scope: {
        kind: 'selected',
        botSlugs: ['dispatch'],
        expectedEditableBotsRevision: 'editable-bots-v1',
      },
    },
    undefined,
  );
  expect(row('dispatch').dataset['teamBotScopeOn']).toBe('true');
  expect(save()).toBeNull();

  await act(async () => mode('全部 Bot').click());
  expect(row('dispatch').textContent).toContain('已包含在「全部 Bot」里。');
  await act(async () => save()!.click());
  expect(call).toHaveBeenCalledWith(
    'roleBotScopeSet',
    { roleId: 'leads', expectedRevision: 4, scope: { kind: 'all' } },
    undefined,
  );
  expect(
    host.querySelector<HTMLElement>('[data-team-bot-scope-kind]')?.dataset['teamBotScopeKind'],
  ).toBe('all');
});

it('keeps the attempted selection after a stale role and reloads the scope', async () => {
  let reads = 0;
  const call = workbench({
    roleBotScope: () => {
      reads++;
      return { ok: true, value: scope({ revision: 3 + reads - 1 }) };
    },
    roleBotScopeSet: () => ({
      ok: false,
      error: { code: 'stale-role', message: 'stale', details: {} },
    }),
  });
  await renderRoles(call);
  await act(async () => toggle('dispatch').click());
  await act(async () => save()!.click());
  expect(reads).toBe(2);
  expect(host.textContent).toContain('Bot 访问范围已变化，已重新载入。');
  expect(row('dispatch').dataset['teamBotScopeOn']).toBe('true');
  expect(save()).not.toBeNull();
});

it('disables all Bots for a role manager without the all-public grant', async () => {
  const call = workbench({
    roleBotScope: () => ({ ok: true, value: scope({ canSetAll: false }) }),
  });
  await renderRoles(call);
  expect(mode('全部 Bot').disabled).toBe(true);
  expect(host.textContent).toContain('才能授予「全部 Bot」');
});

const access: Record<string, BotAccessRolesView> = {
  lobby: {
    slug: 'lobby',
    displayName: 'Lobby',
    ownerHumanId: 'owner',
    audience: 'everyone',
    availableToMembers: true,
    roles: [{ roleId: 'leads', name: 'Leads', source: 'everyone' }],
    invitedMembers: [],
  },
  dispatch: {
    slug: 'dispatch',
    displayName: 'Dispatch',
    ownerHumanId: 'owner',
    audience: 'roles',
    availableToMembers: true,
    roles: [
      { roleId: 'leads', name: 'Leads', source: 'selected' },
      { roleId: 'ops', name: 'Ops', source: 'all' },
    ],
    invitedMembers: [],
  },
  vip: {
    slug: 'vip',
    displayName: 'VIP',
    ownerHumanId: 'owner',
    audience: 'members',
    availableToMembers: true,
    roles: [{ roleId: 'ops', name: 'Ops', source: 'all' }],
    invitedMembers: [{ humanId: 'bob', displayName: 'Bob' }],
  },
  notes: {
    slug: 'notes',
    displayName: 'Notes',
    ownerHumanId: 'owner',
    audience: 'private',
    availableToMembers: false,
    roles: [],
    invitedMembers: [],
  },
};

it('lists who can use each Bot with the source of every role', async () => {
  const call = workbench({
    roleBotScope: () => ({ ok: true, value: scope() }),
    botAccessDirectory: () => ({
      ok: true,
      value: Object.values(access).map(({ slug, displayName }) => ({ slug, displayName })),
    }),
    botAccessRoles: (args) => ({ ok: true, value: access[args['slug'] as string] }),
  });
  await renderRoles(call);
  await act(async () => host.querySelector<HTMLButtonElement>('[data-team-nav="bots"]')!.click());

  expect(host.querySelector('[data-team-bot-detail="lobby"]')).not.toBeNull();
  expect(host.querySelector('[data-team-bot="dispatch"]')?.textContent).toContain('按角色');
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-team-bot="dispatch"]')!.click(),
  );
  const sources = [...host.querySelectorAll<HTMLElement>('[data-team-bot-role]')].map((node) => [
    node.dataset['teamBotRole'],
    node.dataset['teamBotRoleSource'],
  ]);
  expect(sources).toEqual([
    ['leads', 'selected'],
    ['ops', 'all'],
  ]);

  await act(async () => host.querySelector<HTMLButtonElement>('[data-team-bot="vip"]')!.click());
  expect(host.querySelector('[data-team-bot-invitee="bob"]')?.textContent).toContain('Bob');

  await act(async () => host.querySelector<HTMLButtonElement>('[data-team-bot="notes"]')!.click());
  expect(host.textContent).toContain('私有 Bot 只有负责人能用，角色设置不影响它。');
  expect(host.querySelector('[data-team-bot-role]')).toBeNull();
});

it('keeps unsaved Bot choices when switching between All Bots and Selected Bots', async () => {
  const call = workbench({ roleBotScope: () => ({ ok: true, value: scope() }) });
  await renderRoles(call);
  await act(async () => toggle('dispatch').click());
  await act(async () => mode('全部 Bot').click());
  await act(async () => mode('选定的 Bot').click());
  expect(row('dispatch').dataset['teamBotScopeOn']).toBe('true');
  expect(save()).not.toBeNull();
});

it('offers a read retry when the reload after a stale role fails', async () => {
  let reads = 0;
  const call = workbench({
    roleBotScope: () => {
      reads++;
      if (reads === 2) throw new Error('offline');
      return { ok: true, value: scope({ revision: 3 + reads - 1 }) };
    },
    roleBotScopeSet: () => ({
      ok: false,
      error: { code: 'stale-role', message: 'stale', details: {} },
    }),
  });
  await renderRoles(call);
  await act(async () => toggle('dispatch').click());
  await act(async () => save()!.click());
  expect(host.textContent).toContain('没能载入这个角色能访问的 Bot。');
  expect(host.textContent).not.toContain('已重新载入');
  expect(save()!.disabled).toBe(true);
  const retry = [...host.querySelectorAll<HTMLButtonElement>('[data-team-bot-scope] button')].find(
    (node) => node.textContent?.includes('重试'),
  );
  await act(async () => retry!.click());
  expect(reads).toBe(3);
  expect(call.mock.calls.filter(([method]) => method === 'roleBotScopeSet')).toHaveLength(1);
  expect(host.textContent).toContain('已重新载入');
  expect(row('dispatch').dataset['teamBotScopeOn']).toBe('true');
  expect(save()!.disabled).toBe(false);
});

it('keeps the retry for unread Bots visible when a filter matches nothing', async () => {
  const call = workbench({
    roleBotScope: () => ({ ok: true, value: scope() }),
    botAccessDirectory: () => ({ ok: true, value: [{ slug: 'lobby', displayName: 'Lobby' }] }),
    botAccessRoles: () => {
      throw new Error('offline');
    },
  });
  await renderRoles(call);
  await act(async () => host.querySelector<HTMLButtonElement>('[data-team-nav="bots"]')!.click());
  const chip = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
    (node) => node.textContent === '私有',
  );
  await act(async () => chip!.click());
  expect(host.querySelector('[data-team-bot]')).toBeNull();
  expect(host.querySelector('[data-team-bots-retry]')).not.toBeNull();
});

it('keeps Save disabled after Discard until the stale-role reload succeeds', async () => {
  let reads = 0;
  let release: (() => void) | undefined;
  const call = workbench({
    roleBotScope: async () => {
      reads++;
      if (reads === 2) await new Promise<void>((done) => (release = done));
      return { ok: true, value: scope({ revision: 3 + reads - 1 }) };
    },
    roleBotScopeSet: () => ({
      ok: false,
      error: { code: 'stale-role', message: 'stale', details: {} },
    }),
  });
  await renderRoles(call);
  await act(async () => toggle('dispatch').click());
  await act(async () => save()!.click());
  const discard = [
    ...host.querySelectorAll<HTMLButtonElement>('[data-team-bot-scope-actions] button'),
  ].find((node) => node.textContent === '放弃');
  await act(async () => discard!.click());
  await act(async () => toggle('dispatch').click());
  expect(save()!.disabled).toBe(true);
  await act(async () => release!());
  expect(save()!.disabled).toBe(false);
  expect(call.mock.calls.filter(([method]) => method === 'roleBotScopeSet')).toHaveLength(1);
});

it('uses the refreshed selection when the editable Bot set changes after a conflict', async () => {
  const before = scope();
  const after = scope({
    editableBotsRevision: 'editable-bots-v2',
    bots: [
      ...before.bots,
      {
        slug: 'newly-editable',
        displayName: 'Newly editable',
        selected: true,
        editable: true,
        source: 'selected',
        audience: 'roles',
        availableToMembers: true,
      },
    ],
  });
  let current = before;
  const call = workbench({
    roleBotScope: () => ({ ok: true, value: current }),
    roleBotScopeSet: () => {
      current = after;
      return { ok: false, error: { code: 'stale-role', message: 'stale', details: {} } };
    },
  });
  await renderRoles(call);
  await act(async () => toggle('dispatch').click());
  await act(async () => save()!.click());
  expect(row('newly-editable').dataset['teamBotScopeOn']).toBe('true');
  expect(host.textContent).toContain('Bot 访问范围已变化，已重新载入。检查选项后再保存。');
  expect(save()).toBeNull();
});

it('keeps the saved selection when a pre-save read completes late', async () => {
  const before = scope();
  const after = scope({
    revision: 4,
    editableBotsRevision: 'editable-bots-v2',
    bots: before.bots.map((bot) => (bot.slug === 'dispatch' ? { ...bot, selected: true } : bot)),
  });
  let releaseRead: (() => void) | undefined;
  const lateRead = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  let reads = 0;
  const call = workbench({
    roleBotScope: async () => {
      if (++reads > 1) await lateRead;
      return { ok: true, value: before };
    },
    roleBotScopeSet: () => ({ ok: true, value: after }),
  });
  const render = (revision: number) =>
    root.render(
      <RoleBotScope
        call={call}
        t={zhTranslate}
        roleId="leads"
        revision={revision}
        onChanged={() => {}}
      />,
    );
  await act(async () => render(3));
  await act(async () => toggle('dispatch').click());
  await act(async () => render(4));
  expect(reads).toBe(2);
  await act(async () => save()!.click());
  await act(async () => releaseRead?.());
  expect(row('dispatch').dataset['teamBotScopeOn']).toBe('true');
  expect(save()).toBeNull();
});
