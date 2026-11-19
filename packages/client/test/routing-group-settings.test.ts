// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RoutingGroupEngineOptions } from '@botharness/host-protocol/subscription-engine';
import type { RoutingGroupMemberView, RoutingGroupView } from '../src/client/bridge.js';
import { zhTranslate as t } from '../src/client/locale.js';
import { RoutingGroupSettings } from '../src/client/routing-group-settings.js';
import { buttonNamed, dialog, fieldNamed, typeInto } from './primitive-mocks.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  ...(await import('./primitive-mocks.js')).dialogPrimitives(),
}));

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

const FLASH = { provider: 'opencode-go', model: 'deepseek-v4.1-flash' };
const PRO = { provider: 'deepseek-official', model: 'deepseek-v4-pro' };
const models = [
  { ...FLASH, providerName: 'OpenCode Go', modelName: 'DeepSeek V4.1 Flash', efforts: [] },
  { ...PRO, providerName: 'DeepSeek', modelName: 'V4 Pro', efforts: [] },
];

function harness(initial: RoutingGroupView[]) {
  let groups = [...initial];
  const actions = {
    routingGroupEngines: vi.fn(async (): Promise<RoutingGroupEngineOptions[]> => [
      { engine: 'codex', available: true, models: [{ id: 'gpt-5.4', name: 'GPT-5.4' }] },
      { engine: 'claude', available: false, reason: 'signed-out' },
    ]),
    modelCatalog: vi.fn(async () => ({ models })),
    routingGroups: vi.fn(async () => ({
      groups,
      rests: [{ ...FLASH, until: '2026-11-22T10:00:00.000Z', reason: 'quota' as const }],
    })),
    createRoutingGroup: vi.fn(async (name: string, members: RoutingGroupMemberView[]) => {
      if (members.every((member) => member.kind === 'engine'))
        throw new Error('This Routing Group would have no model to run on');
      const group: RoutingGroupView = {
        id: 'g-new',
        name,
        revision: 1,
        mode: 'order',
        members,
        createdAt: '',
        updatedAt: '',
      };
      groups = [...groups, group];
      return group;
    }),
    updateRoutingGroup: vi.fn(
      async (id: string, revision: number, name: string, members: RoutingGroupMemberView[]) => {
        const group = { ...groups.find((entry) => entry.id === id)!, name, members };
        groups = groups.map((entry) => (entry.id === id ? group : entry));
        return { ...group, revision: revision + 1 };
      },
    ),
    deleteRoutingGroup: vi.fn(async (): Promise<RoutingGroupView> => {
      throw new Error('Routing Group DeepSeek is used by Ada');
    }),
  };
  return actions;
}

async function render(actions: ReturnType<typeof harness>): Promise<void> {
  await act(async () => root.render(createElement(RoutingGroupSettings, { actions, t })));
  await act(async () => undefined);
}

const group: RoutingGroupView = {
  id: 'g-1',
  name: 'DeepSeek',
  revision: 3,
  mode: 'order',
  members: [
    { kind: 'model', ...FLASH },
    { kind: 'model', ...PRO },
  ],
  createdAt: '',
  updatedAt: '',
};
const codex = { kind: 'engine', engine: 'codex', model: 'gpt-5.4' } as const;
const claude = { kind: 'engine', engine: 'claude' } as const;

it('lists groups with their members in order and marks a resting member', async () => {
  await render(harness([group]));
  const row = host.querySelector('[data-routing-group="g-1"]')!;
  expect(row.textContent).toContain('DeepSeek');
  expect(row.textContent).toMatch(/V4\.1 Flash.*休息至 .*→V4 Pro/u);
});

it('creates a group from models picked in order', async () => {
  const actions = harness([]);
  await render(actions);
  await act(async () => buttonNamed(t('routingGroups.create')).click());
  await typeInto(fieldNamed(t('routingGroups.name'), dialog()), 'Fast first');
  await addMember(`model:${JSON.stringify([PRO.provider, PRO.model, ''])}`);
  await addMember(`model:${JSON.stringify([FLASH.provider, FLASH.model, ''])}`);
  await act(async () =>
    dialog().querySelector<HTMLButtonElement>('[data-routing-group-submit="create"]')!.click(),
  );
  expect(actions.createRoutingGroup).toHaveBeenCalledWith('Fast first', [
    { kind: 'model', ...PRO },
    { kind: 'model', ...FLASH },
  ]);
});

it('reorders members with the keyboard-reachable move buttons and saves the revision', async () => {
  const actions = harness([group]);
  await render(actions);
  await act(async () => buttonNamed(t('routingGroups.editTitle', { name: 'DeepSeek' })).click());
  const down = buttonNamed(t('routingGroups.moveDown', { name: 'DeepSeek V4.1 Flash' }), dialog());
  expect(down.tagName).toBe('BUTTON');
  await act(async () => down.click());
  expect(buttonNamed(t('routingGroups.moveUp', { name: 'V4 Pro' }), dialog()).disabled).toBe(true);
  await act(async () =>
    dialog().querySelector<HTMLButtonElement>('[data-routing-group-submit="edit"]')!.click(),
  );
  expect(actions.updateRoutingGroup).toHaveBeenCalledWith('g-1', 3, 'DeepSeek', [
    { kind: 'model', ...PRO },
    { kind: 'model', ...FLASH },
  ]);
});

it("shows the Host's refusal when a used group is deleted", async () => {
  const actions = harness([group]);
  await render(actions);
  await act(async () => buttonNamed(t('routingGroups.editTitle', { name: 'DeepSeek' })).click());
  await act(async () => buttonNamed(t('routingGroups.delete'), dialog()).click());
  await act(async () => buttonNamed(t('routingGroups.delete'), dialog()).click());
  await act(async () => undefined);
  expect(actions.deleteRoutingGroup).toHaveBeenCalledWith('g-1', 3);
  expect(dialog().textContent).toContain('Routing Group DeepSeek is used by Ada');
});

function option(value: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('[data-picker-option]')].find(
    (row) => row.dataset.pickerOption === value,
  );
}

async function addMember(value: string, engine = false) {
  await act(async () => buttonNamed(t('routingGroups.add'), dialog()).click());
  if (engine) {
    await act(async () => buttonNamed(t('routingGroups.engines')).click());
    expect(option('engine:["claude",""]')).toMatchObject({ disabled: true });
  }
  await act(async () => option(value)!.click());
}

it('adds an available engine model, reorders it and removes a different engine member', async () => {
  const actions = harness([{ ...group, members: [...group.members, claude] }]);
  await render(actions);
  await act(async () => buttonNamed(t('routingGroups.editTitle', { name: 'DeepSeek' })).click());
  await addMember('engine:["codex","gpt-5.4"]', true);
  expect(
    dialog().querySelector(
      `[data-routing-group-member='engine:["codex","gpt-5.4"]'] [data-model-brand="openai"]`,
    ),
  ).not.toBeNull();
  await act(async () =>
    buttonNamed(t('routingGroups.moveUp', { name: 'GPT-5.4' }), dialog()).click(),
  );
  await act(async () =>
    buttonNamed(t('routingGroups.remove', { name: 'Claude Code 默认模型' }), dialog()).click(),
  );
  await act(async () => buttonNamed(t('routingGroups.save'), dialog()).click());
  expect(actions.updateRoutingGroup).toHaveBeenCalledWith('g-1', 3, 'DeepSeek', [
    ...group.members,
    codex,
  ]);
});

it.each(['signed-out', 'not-installed'] as const)(
  'numbers mixed members and keeps a saved %s engine editable with a reason',
  async (reason) => {
    const nested = { ...group, id: 'nested', name: 'Nested' };
    const actions = harness([
      { ...group, members: [group.members[0]!, { kind: 'group', id: nested.id }, codex, claude] },
      nested,
    ]);
    actions.routingGroupEngines.mockResolvedValueOnce([
      { engine: 'claude', available: false, reason },
    ]);
    await render(actions);
    expect(actions.routingGroupEngines).not.toHaveBeenCalled();
    await act(async () => buttonNamed(t('routingGroups.editTitle', { name: group.name })).click());
    const rows = [...dialog().querySelectorAll('[data-routing-group-member]')];
    expect(rows.map((row) => row.firstElementChild?.textContent)).toEqual(['1', '2', '3', '4']);
    expect(rows[0]?.textContent).toMatch(/^1V4\.1 FlashOpenCode Go/u);
    expect(rows[1]?.textContent).toContain(nested.name);
    expect(rows[2]?.textContent).toContain('GPT-5.4');
    expect(rows[3]?.textContent).toContain(
      t(reason === 'signed-out' ? 'engine.signInLabel' : 'engine.notInstalled', {
        engine: 'Claude Code',
      }),
    );
    expect(
      buttonNamed(t('routingGroups.remove', { name: 'Claude Code 默认模型' }), dialog()).disabled,
    ).toBe(false);
  },
);

it('retries the engine catalog in place, searches across fields and keeps the draft', async () => {
  const actions = harness([group]);
  actions.routingGroupEngines.mockRejectedValueOnce(new Error('Disconnected'));
  await render(actions);
  await act(async () => buttonNamed(t('routingGroups.editTitle', { name: group.name })).click());
  await typeInto(fieldNamed(t('routingGroups.name'), dialog()), 'Renamed draft');
  await act(async () => buttonNamed(t('routingGroups.add'), dialog()).click());
  await act(async () => buttonNamed(t('routingGroups.engines')).click());
  const search = document.querySelector('[data-filter-picker] input[role="combobox"]');
  if (!(search instanceof HTMLInputElement)) throw new Error('Missing picker search');
  await typeInto(search, 'Codex GPT-5.4');
  expect(document.querySelector('[data-filter-picker] [role="alert"]')?.textContent).toBe(
    t('routingGroups.enginesUnavailable'),
  );
  await act(async () => buttonNamed(t('routingGroups.retryEngines')).click());
  expect(actions.routingGroupEngines).toHaveBeenCalledTimes(2);
  expect(search.value).toBe('Codex GPT-5.4');
  const modelKey = 'engine:["codex","gpt-5.4"]';
  expect(option(modelKey)?.disabled).toBe(false);
  expect(option('engine:["codex",""]')).toBeUndefined();
  await typeInto(search, 'gpt-5.4');
  expect(option(modelKey)?.disabled).toBe(false);
  await act(async () => option(modelKey)!.click());
  await act(async () => buttonNamed(t('routingGroups.save'), dialog()).click());
  expect(actions.updateRoutingGroup).toHaveBeenCalledWith(
    group.id,
    group.revision,
    'Renamed draft',
    [...group.members, codex],
  );
});

it('shows a successful empty catalog without a retry action', async () => {
  const actions = harness([group]);
  actions.routingGroupEngines.mockResolvedValueOnce([]);
  await render(actions);
  await act(async () => buttonNamed(t('routingGroups.editTitle', { name: group.name })).click());
  await act(async () => buttonNamed(t('routingGroups.add'), dialog()).click());
  await act(async () => buttonNamed(t('routingGroups.engines')).click());
  const picker = document.querySelector('[data-filter-picker]');
  expect(picker?.textContent).toContain(t('routingGroups.noEngines'));
  expect(picker?.querySelector('[role="alert"]')).toBeNull();
  expect(picker?.textContent).not.toContain(t('routingGroups.retryEngines'));
});

it('refreshes availability when the picker and engine filter reopen and keeps the last choices visible', async () => {
  const actions = harness([group]);
  const fresh = Promise.withResolvers<RoutingGroupEngineOptions[]>();
  const signedOut = { engine: 'claude', available: false, reason: 'signed-out' } as const;
  actions.routingGroupEngines
    .mockResolvedValueOnce([signedOut])
    .mockResolvedValueOnce([signedOut])
    .mockReturnValueOnce(fresh.promise);
  await render(actions);
  await act(async () => buttonNamed(t('routingGroups.editTitle', { name: group.name })).click());
  const name = fieldNamed(t('routingGroups.name'), dialog());
  await typeInto(name, 'Renamed draft');
  const add = buttonNamed(t('routingGroups.add'), dialog());
  await act(async () => add.click());
  await act(async () => buttonNamed(t('routingGroups.engines')).click());
  const engine = 'engine:["claude",""]';
  expect(option(engine)?.disabled).toBe(true);
  await act(async () => add.click());
  await act(async () => add.click());
  await act(async () => buttonNamed(t('routingGroups.engines')).click());
  expect(actions.routingGroupEngines).toHaveBeenCalledTimes(2);
  await act(async () => buttonNamed(t('routingGroups.models')).click());
  await act(async () => buttonNamed(t('routingGroups.engines')).click());
  expect(actions.routingGroupEngines).toHaveBeenCalledTimes(3);
  expect(option(engine)?.disabled).toBe(true);
  await act(async () => fresh.resolve([{ engine: 'claude', available: true, models: [] }]));
  expect(option(engine)?.disabled).toBe(false);
  expect(option(engine)?.textContent).not.toContain(
    t('engine.signInLabel', { engine: 'Claude Code' }),
  );
  expect(name.value).toBe('Renamed draft');
});

it('shows disabled Subscription Engines and the Host refusal for an engine-only group', async () => {
  const actions = harness([]);
  await render(actions);
  await act(async () => buttonNamed(t('routingGroups.create')).click());
  await typeInto(fieldNamed(t('routingGroups.name'), dialog()), 'Engine only');
  await act(async () => buttonNamed(t('routingGroups.add'), dialog()).click());
  await act(async () => buttonNamed(t('routingGroups.engines')).click());
  expect(option('engine:["claude",""]')).toMatchObject({ disabled: true });
  expect(option('engine:["claude",""]')?.textContent).toContain('登录 Claude Code');
  await act(async () => option('engine:["codex",""]')!.click());
  expect(dialog().textContent).toContain(t('routingGroups.requiresModel'));
  await act(async () =>
    dialog().querySelector<HTMLButtonElement>('[data-routing-group-submit]')!.click(),
  );
  expect(actions.createRoutingGroup).toHaveBeenCalledWith('Engine only', [
    { kind: 'engine', engine: 'codex' },
  ]);
  expect(dialog().querySelector('[role="alert"]')?.textContent).toBe(
    'This Routing Group would have no model to run on',
  );
});
