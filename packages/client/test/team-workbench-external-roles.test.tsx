// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  ExternalRoleBotScope,
  HostExternalRole,
} from '@botharness/host-client/external-roles';
import { fakeTeamMode } from '../../host-client/test/reader-fixtures.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { ExternalRolesSection } from '../src/client/team-workbench/external-roles-section.js';
import {
  capabilityChoice,
  scopeSummary,
  withBot,
  withCapability,
} from '../src/client/team-workbench/external-role-model.js';
import { visibleSections } from '../src/client/team-workbench/sections.js';

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

function role(overrides: Partial<HostExternalRole> = {}): HostExternalRole {
  return {
    id: 'regulars',
    name: '老客户',
    botScope: { kind: 'only', botSlugs: ['support'] },
    behavior: '可以查询订单。',
    policy: [],
    capabilities: ['answer'],
    deniedCapabilities: [],
    revision: 1,
    ...overrides,
  };
}

const bots = [
  { slug: 'support', displayName: '客服助手' },
  { slug: 'sales', displayName: '销售助手' },
];

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await act(async () => Promise.resolve());
}

function find(selector: string): HTMLElement {
  const node = host.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}

it('moves a pairing capability between allow, unset and deny and keeps delegation inside it', () => {
  const base = role({ capabilities: ['answer', 'approve'], delegableCapabilities: ['approve'] });
  expect(capabilityChoice(base, 'answer')).toBe('allow');
  expect(capabilityChoice(base, 'reject')).toBe('unset');
  expect(withCapability(base, 'approve', 'deny')).toEqual({
    capabilities: ['answer'],
    deniedCapabilities: ['approve'],
    delegableCapabilities: [],
  });
  expect(capabilityChoice({ ...base, deniedCapabilities: ['answer'] }, 'answer')).toBe('deny');
});

it('adds and removes Bots from a selected scope and leaves an all-Bots scope alone', () => {
  const only: ExternalRoleBotScope = { kind: 'only', botSlugs: ['support'] };
  expect(withBot(only, 'sales', true)).toEqual({ kind: 'only', botSlugs: ['support', 'sales'] });
  expect(withBot(only, 'support', false)).toEqual({ kind: 'only', botSlugs: [] });
  expect(withBot({ kind: 'all' }, 'sales', false)).toEqual({ kind: 'all' });
  const name = (slug: string) => (slug === 'support' ? '客服助手' : slug);
  expect(scopeSummary(zhTranslate, only, name)).toBe('客服助手');
  expect(scopeSummary(zhTranslate, { kind: 'only', botSlugs: [] }, name)).toBe('没有 Bot');
  expect(scopeSummary(zhTranslate, { kind: 'all' }, name)).toBe('全部 Bot');
});

it('shows external roles only to the Host Owner', () => {
  const owner = { ...fakeTeamMode(), enabled: true } as never;
  const member = {
    ...fakeTeamMode({ kind: 'member', humanId: 'ann', permissions: ['roles.manage'] }),
    enabled: true,
  } as never;
  const ids = (view: never) =>
    visibleSections({ view, roles: [], members: [] }).map((section) => section.id);
  expect(ids(owner)).toContain('externalRoles');
  expect(ids(member)).not.toContain('externalRoles');
});

it('shows a migrated role on its original Bot and saves an explicit scope change', async () => {
  let current = role();
  const changes: unknown[] = [];
  const call = vi.fn<BridgeCall>(async (method, args) => {
    if (method === 'externalRoles') return { ok: true, value: { roles: [current] } };
    if (method === 'list') return { ok: true, value: { bots } };
    if (method === 'externalRoleChange') {
      changes.push(args['input']);
      current = { ...current, ...(args['input'] as object), revision: current.revision + 1 };
      return { ok: true, value: { role: current } };
    }
    return { ok: false, error: { code: 'unexpected', message: method, details: {} } };
  });
  await act(async () => root.render(<ExternalRolesSection call={call} t={zhTranslate} />));
  await settle();

  expect(find('[data-external-role="regulars"]').textContent).toContain('客服助手');
  expect(find('[data-external-role-bot="support"]').dataset['covered']).toBe('true');
  expect(find('[data-external-role-bot="sales"]').dataset['covered']).toBe('false');
  expect(changes).toEqual([]);

  await act(async () => find('[data-external-role-bot="sales"] button').click());
  await settle();

  expect(changes).toEqual([
    {
      kind: 'update',
      id: 'regulars',
      expectedRevision: 1,
      botScope: { kind: 'only', botSlugs: ['support', 'sales'] },
    },
  ]);
  expect(find('[data-external-role-bot="sales"]').dataset['covered']).toBe('true');
});

it('keeps the edit unsaved and offers a reload when another change landed first', async () => {
  let current = role();
  const call = vi.fn<BridgeCall>(async (method) => {
    if (method === 'externalRoles') return { ok: true, value: { roles: [current] } };
    if (method === 'list') return { ok: true, value: { bots } };
    if (method === 'externalRoleChange') {
      current = { ...current, name: '老客户（新）', revision: 2 };
      return {
        ok: false,
        error: { code: 'role-stale', message: 'role-stale', details: {} },
      };
    }
    return { ok: false, error: { code: 'unexpected', message: '', details: {} } };
  });
  await act(async () => root.render(<ExternalRolesSection call={call} t={zhTranslate} />));
  await settle();

  await act(async () => find('[data-external-role-bot="sales"] button').click());
  await settle();
  expect(find('[data-external-role-conflict]').textContent).toContain('刚被别处改过');
  expect(find('[data-external-role-bot="sales"]').dataset['covered']).toBe('false');

  await act(async () => find('[data-external-role-reload]').click());
  await settle();
  expect(host.querySelector('[data-external-role-conflict]')).toBeNull();
  expect(find('[data-external-role-detail="regulars"]').textContent).toContain('老客户（新）');
});

it('lists the contacts holding a role with the status the Host reports', async () => {
  const call = vi.fn<BridgeCall>(async (method, args) => {
    if (method === 'externalRoles') return { ok: true, value: { roles: [role()] } };
    if (method === 'list') return { ok: true, value: { bots } };
    if (method === 'messagingSnapshot')
      return {
        ok: true,
        value: {
          accounts: [],
          grants: [],
          intents: [],
          pairings:
            args['slug'] === 'support'
              ? [
                  {
                    id: 'p1',
                    status: 'approved',
                    roleId: 'regulars',
                    bindingId: 'b1',
                    actorId: 'ou_ada',
                    actorName: 'Ada',
                    accountName: 'QA 客服应用',
                  },
                  {
                    id: 'p2',
                    status: 'approved',
                    roleId: 'regulars',
                    bindingId: 'b1',
                    actorId: 'ou_linus',
                    actorName: 'Linus',
                    accountName: 'QA 客服应用',
                  },
                  {
                    id: 'p3',
                    status: 'pending',
                    roleId: 'regulars',
                    bindingId: 'b1',
                    actorId: 'ou_new',
                    accountName: 'QA 客服应用',
                  },
                ]
              : [],
        },
      };
    if (method === 'externalContactAccess')
      return {
        ok: true,
        value: {
          status: args['actorId'] === 'ou_linus' ? 'blocked' : 'paired',
          canSpeak: args['actorId'] !== 'ou_linus',
          roleIds: ['regulars'],
          capabilities: [],
          deniedCapabilities: [],
        },
      };
    return { ok: false, error: { code: 'unexpected', message: method, details: {} } };
  });
  await act(async () => root.render(<ExternalRolesSection call={call} t={zhTranslate} />));
  await settle();
  await act(async () =>
    [...host.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find((node) => node.textContent?.includes('联系人'))
      ?.click(),
  );
  await settle();

  const statuses = [...host.querySelectorAll<HTMLElement>('[data-external-role-contact]')].map(
    (row) => [
      row.dataset['externalRoleContact'],
      row.querySelector<HTMLElement>('[data-external-role-contact-status]')?.dataset[
        'externalRoleContactStatus'
      ],
    ],
  );
  expect(statuses).toEqual([
    ['Ada', 'paired'],
    ['Linus', 'blocked'],
  ]);
  expect(call).toHaveBeenCalledWith(
    'messagingSnapshot',
    { slug: 'sales', mode: 'saved' },
    expect.anything(),
  );
});

it('reloads the role and keeps the typed name when a rename lands on a stale revision', async () => {
  let current = role();
  const renames: unknown[] = [];
  const call = vi.fn<BridgeCall>(async (method, args) => {
    if (method === 'externalRoles') return { ok: true, value: { roles: [current] } };
    if (method === 'list') return { ok: true, value: { bots } };
    if (method === 'externalRoleChange') {
      const input = args['input'] as { expectedRevision: number; name: string };
      renames.push(input);
      if (input.expectedRevision !== current.revision)
        return { ok: false, error: { code: 'role-stale', message: 'role-stale', details: {} } };
      current = { ...current, name: input.name, revision: current.revision + 1 };
      return { ok: true, value: { role: current } };
    }
    return { ok: false, error: { code: 'unexpected', message: method, details: {} } };
  });
  await act(async () => root.render(<ExternalRolesSection call={call} t={zhTranslate} />));
  await settle();
  current = { ...current, behavior: '别处改过', revision: 2 };

  await act(async () => find('[data-external-role-rename]').click());
  const input = document.querySelector<HTMLInputElement>('[data-external-role-name]');
  if (!input) throw new Error('Missing name field');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'VIP');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const submit = () =>
    document.querySelector<HTMLButtonElement>('[data-external-role-submit]')?.click();
  await act(async () => submit());
  await settle();
  expect(document.body.textContent).toContain('已载入最新版本');
  expect(document.querySelector<HTMLInputElement>('[data-external-role-name]')?.value).toBe('VIP');

  await act(async () => submit());
  await settle();
  expect(renames).toEqual([
    expect.objectContaining({ expectedRevision: 1, name: 'VIP' }),
    expect.objectContaining({ expectedRevision: 2, name: 'VIP' }),
  ]);
  expect(find('[data-external-role-detail="regulars"]').textContent).toContain('VIP');
});

it('keeps Save off and offers a retry when the reload after a stale rename fails', async () => {
  let current = role();
  let readFails = false;
  const renames: unknown[] = [];
  const call = vi.fn<BridgeCall>(async (method, args) => {
    if (method === 'externalRoles')
      return readFails
        ? { ok: false, error: { code: 'unavailable', message: 'down', details: {} } }
        : { ok: true, value: { roles: [current] } };
    if (method === 'list') return { ok: true, value: { bots } };
    if (method === 'externalRoleChange') {
      const input = args['input'] as { expectedRevision: number; name: string };
      renames.push(input);
      if (input.expectedRevision !== current.revision)
        return { ok: false, error: { code: 'role-stale', message: 'role-stale', details: {} } };
      current = { ...current, name: input.name, revision: current.revision + 1 };
      return { ok: true, value: { role: current } };
    }
    return { ok: false, error: { code: 'unexpected', message: method, details: {} } };
  });
  await act(async () => root.render(<ExternalRolesSection call={call} t={zhTranslate} />));
  await settle();
  current = { ...current, revision: 2 };
  readFails = true;

  await act(async () => find('[data-external-role-rename]').click());
  const input = document.querySelector<HTMLInputElement>('[data-external-role-name]');
  if (!input) throw new Error('Missing name field');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'VIP');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const submit = () => document.querySelector<HTMLButtonElement>('[data-external-role-submit]');
  await act(async () => submit()?.click());
  await settle();
  expect(document.body.textContent).toContain('最新版本没有载入');
  expect(submit()?.disabled).toBe(true);
  expect(document.querySelector<HTMLInputElement>('[data-external-role-name]')?.value).toBe('VIP');

  const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent === '取消',
  );
  await act(async () => cancel?.click());
  await settle();
  expect(document.querySelector('[data-external-role-name]')).toBeNull();
  await act(async () => find('[data-external-role-rename]').click());
  expect(submit()?.disabled).toBe(true);
  expect(document.querySelector('[data-external-role-dialog-reload]')).not.toBeNull();
  expect(renames).toHaveLength(1);

  readFails = false;
  await act(async () => {
    const reopened = document.querySelector<HTMLInputElement>('[data-external-role-name]');
    if (!reopened) throw new Error('Missing name field');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      reopened,
      'VIP',
    );
    reopened.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[data-external-role-dialog-reload]')?.click(),
  );
  await settle();
  expect(document.querySelector('[data-external-role-dialog-reload]')).toBeNull();
  expect(submit()?.disabled).toBe(false);
  await act(async () => submit()?.click());
  await settle();
  expect(renames).toEqual([
    expect.objectContaining({ expectedRevision: 1, name: 'VIP' }),
    expect.objectContaining({ expectedRevision: 2, name: 'VIP' }),
  ]);
});
