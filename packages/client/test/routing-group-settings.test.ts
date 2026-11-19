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
  { ...FLASH, providerName: 'OpenCode Go', modelName: 'V4.1 Flash', efforts: [] },
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
  const down = buttonNamed(t('routingGroups.moveDown', { name: 'V4.1 Flash' }), dialog());
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
  const codex = { kind: 'engine', engine: 'codex', model: 'gpt-5.4' } as const;
  const actions = harness([
    { ...group, members: [...group.members, { kind: 'engine', engine: 'claude' }] },
  ]);
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
