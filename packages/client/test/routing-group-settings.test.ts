// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RoutingGroupMemberView, RoutingGroupView } from '../src/client/bridge.js';
import { zhTranslate as t } from '../src/client/locale.js';
import { RoutingGroupSettings } from '../src/client/routing-group-settings.js';
import { buttonNamed, chooseOption, dialog, fieldNamed, typeInto } from './primitive-mocks.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
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
    modelCatalog: vi.fn(async () => ({ models })),
    routingGroups: vi.fn(async () => ({
      groups,
      rests: [{ ...FLASH, until: '2026-11-22T10:00:00.000Z', reason: 'quota' as const }],
    })),
    createRoutingGroup: vi.fn(async (name: string, members: RoutingGroupMemberView[]) => {
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
  await chooseOption(
    t('routingGroups.add'),
    `model:${JSON.stringify([PRO.provider, PRO.model, ''])}`,
    dialog(),
  );
  await chooseOption(
    t('routingGroups.add'),
    `model:${JSON.stringify([FLASH.provider, FLASH.model, ''])}`,
    dialog(),
  );
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
