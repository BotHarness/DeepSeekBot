// @vitest-environment jsdom
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./primitive-mocks.js')).comboboxPrimitives(),
);

import type { EngineStatusView } from '../src/client/engine-choice.js';
import { modelFamilies } from '@botharness/host-client/shared/model-brand';
import type { ModelCatalogEntryView } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import {
  ModelMenu,
  catalogMenuItems,
  engineMenuItems,
  presetMenuItems,
} from '../src/client/model-menu.js';
import { rememberModelFavorites } from '../src/client/model-favorites.js';

const catalog: ModelCatalogEntryView[] = [
  {
    provider: 'opencode-go',
    providerName: 'OpenCode Go',
    model: 'deepseek-v4.1-flash',
    modelName: 'DeepSeek V4.1 Flash',
    efforts: [{ id: 'high', name: 'High' }],
  },
  {
    provider: 'openai',
    providerName: 'OpenAI',
    model: 'gpt-6.1',
    modelName: 'GPT-6.1',
    efforts: [],
  },
  {
    provider: 'anthropic',
    providerName: 'Anthropic',
    model: 'claude-opus',
    modelName: 'Claude Opus',
    efforts: [],
    credential: 'missing',
  },
  {
    provider: 'lab',
    providerName: 'Lab',
    model: 'house-model',
    modelName: 'house-model',
    efforts: [],
  },
];

const key = (entry: ModelCatalogEntryView) => JSON.stringify([entry.provider, entry.model]);

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  rememberModelFavorites(undefined);
});

async function render(props: Partial<Parameters<typeof ModelMenu>[0]> = {}) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  const anchor = document.createElement('button');
  document.body.append(host, anchor);
  const anchorRef = createRef<HTMLButtonElement>();
  Object.assign(anchorRef, { current: anchor });
  const root = createRoot(host);
  const onSelect = vi.fn();
  const onClose = vi.fn();
  await act(async () =>
    root.render(
      createElement(ModelMenu, {
        label: 'Model',
        items: catalogMenuItems(catalog, zhTranslate),
        value: key(catalog[0]!),
        onSelect,
        anchorRef,
        onClose,
        t: zhTranslate,
        ...props,
      }),
    ),
  );
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
    anchor.remove();
  };
  const rows = () =>
    [...document.body.querySelectorAll<HTMLButtonElement>('[data-picker-option]')].map(
      (row) => row.textContent,
    );
  return { onSelect, onClose, rows };
}

it('groups the Host catalog by model family, unknown families last', () => {
  expect(
    modelFamilies(
      catalog.map((entry) => ({
        provider: entry.provider,
        model: entry.model,
        name: entry.modelName,
      })),
    ).map((family) => [family.brand, family.count]),
  ).toEqual([
    ['deepseek', 1],
    ['openai', 1],
    ['claude', 1],
    [undefined, 1],
  ]);
});

it('lists models with their family logo, full name and provider, usable ones first', async () => {
  const { rows } = await render();
  expect(rows()).toEqual([
    'DeepSeek V4.1 FlashOpenCode GoCtrl+1',
    'GPT-6.1OpenAICtrl+2',
    'house-modelLabCtrl+3',
    `Claude Opus${zhTranslate('modelPreset.credentialMissing', { provider: 'Anthropic' })}`,
  ]);
  expect(
    document.body.querySelector(`[data-picker-option='${key(catalog[0]!)}'] [data-model-brand]`),
  ).not.toBeNull();
  expect(
    document.body
      .querySelector(`[data-picker-option='${key(catalog[2]!)}']`)
      ?.hasAttribute('disabled'),
  ).toBe(true);
});

it('filters by family from the rail and by text from the search field', async () => {
  const { rows } = await render();
  expect(
    [...document.body.querySelectorAll('[data-picker-filter]')].map((node) =>
      node.getAttribute('data-picker-filter'),
    ),
  ).toEqual(['all', 'deepseek', 'openai', 'claude', 'other']);
  await act(async () =>
    document.body.querySelector<HTMLButtonElement>('[data-picker-filter="openai"]')!.click(),
  );
  expect(rows()).toEqual(['GPT-6.1OpenAICtrl+1']);
  await act(async () =>
    document.body.querySelector<HTMLButtonElement>('[data-picker-filter="all"]')!.click(),
  );
  const search = document.body.querySelector<HTMLInputElement>('[role="combobox"]')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(search, 'house');
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(rows()).toEqual(['house-modelLabCtrl+1']);
});

it('chooses with the keyboard and closes when there is no effort to pick', async () => {
  const { onSelect, onClose } = await render();
  const search = document.body.querySelector<HTMLInputElement>('[role="combobox"]')!;
  await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(document.activeElement).toBe(search);
  for (let step = 0; step < 2; step += 1)
    await act(async () =>
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
    );
  await act(async () =>
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  );
  expect(onSelect).toHaveBeenCalledWith(key(catalog[1]!));
  expect(onClose).toHaveBeenCalledOnce();
});

it('shows the reasoning column beside the list and keeps the menu open to pick one', async () => {
  const onEffort = vi.fn();
  const { onSelect, onClose } = await render({
    efforts: [
      { value: '', label: 'Provider default' },
      { value: 'high', label: 'High' },
    ],
    effort: '',
    onEffort,
  });
  await act(async () =>
    document.body.querySelector<HTMLButtonElement>('[data-picker-side="high"]')!.click(),
  );
  expect(onEffort).toHaveBeenCalledWith('high');
  await act(async () =>
    document.body
      .querySelector<HTMLButtonElement>(`[data-picker-option='${key(catalog[1]!)}']`)!
      .click(),
  );
  expect(onSelect).toHaveBeenCalledWith(key(catalog[1]!));
  expect(onClose).not.toHaveBeenCalled();
});

it('closes on Escape from the family rail and returns focus to the trigger', async () => {
  const { onClose } = await render();
  const rail = document.body.querySelector<HTMLButtonElement>('[data-picker-filter="openai"]')!;
  rail.focus();
  await act(async () =>
    rail.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(onClose).toHaveBeenCalledOnce();
});

it('holds model and effort choices while a change is saving', async () => {
  const onEffort = vi.fn();
  const { onSelect } = await render({
    busy: true,
    efforts: [
      { value: '', label: 'Provider default' },
      { value: 'high', label: 'High' },
    ],
    effort: '',
    onEffort,
  });
  expect(
    document.body.querySelector<HTMLButtonElement>(`[data-picker-option='${key(catalog[1]!)}']`)!
      .disabled,
  ).toBe(true);
  expect(
    document.body.querySelector<HTMLButtonElement>('[data-picker-side="high"]')!.disabled,
  ).toBe(true);
  const search = document.body.querySelector<HTMLInputElement>('[role="combobox"]')!;
  await act(async () =>
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  );
  expect(onSelect).not.toHaveBeenCalled();
});

it('opens on Favorites, stars from the row and jumps with Ctrl+number', async () => {
  const write = vi.fn(async (choice: { kind: string }, favorite: boolean) =>
    favorite
      ? [
          { kind: 'model' as const, provider: 'openai', model: 'gpt-6.1' },
          choice as { kind: 'model'; provider: string; model: string },
        ]
      : [],
  );
  rememberModelFavorites([{ kind: 'model', provider: 'openai', model: 'gpt-6.1' }], 'host', write);
  const { rows, onSelect } = await render();
  expect(
    document.body.querySelector('[data-picker-filter="favorites"]')?.getAttribute('aria-pressed'),
  ).toBe('true');
  expect(rows()).toEqual(['GPT-6.1OpenAICtrl+1']);
  await act(async () =>
    document.body.querySelector<HTMLButtonElement>('[data-picker-filter="all"]')!.click(),
  );
  expect(rows()[0]).toBe('GPT-6.1OpenAICtrl+1');
  await act(async () =>
    document.body
      .querySelector<HTMLButtonElement>(`[data-picker-favorite='${key(catalog[3]!)}']`)!
      .click(),
  );
  expect(write).toHaveBeenCalledWith(
    { kind: 'model', provider: 'lab', model: 'house-model' },
    true,
  );
  expect(
    document.body
      .querySelector(`[data-picker-favorite='${key(catalog[3]!)}']`)
      ?.getAttribute('aria-pressed'),
  ).toBe('true');
  expect(rows()[0]).toBe('GPT-6.1OpenAICtrl+1');
  expect(rows()[1]).not.toContain('house-model');
  await act(async () =>
    document.body.querySelector<HTMLButtonElement>('[data-picker-filter="favorites"]')!.click(),
  );
  expect(rows()).toHaveLength(2);
  const search = document.body.querySelector<HTMLInputElement>('[role="combobox"]')!;
  await act(async () =>
    search.dispatchEvent(new KeyboardEvent('keydown', { key: '2', ctrlKey: true, bubbles: true })),
  );
  expect(onSelect).toHaveBeenCalledWith(key(catalog[3]!));
});

it('lists Routing Groups in their own column with the member in front, and stars them (#4421)', async () => {
  const until = '2026-11-22T23:23:00.000Z';
  const resting = catalog.map((entry, index) =>
    index === 0 ? { ...entry, restingUntil: until } : entry,
  );
  const groups = [
    {
      id: 'daily',
      name: 'Daily',
      revision: 1,
      routes: [catalog[0]!, catalog[1]!].map(({ provider, model }) => ({ provider, model })),
    },
    {
      id: 'flash-only',
      name: 'Flash only',
      revision: 1,
      routes: [{ provider: catalog[0]!.provider, model: catalog[0]!.model }],
      restingUntil: until,
    },
  ];
  const write = vi.fn(async (choice: { kind: string }) => [
    choice as { kind: 'group'; id: string },
  ]);
  rememberModelFavorites([], 'host', write);
  const { rows, onSelect } = await render({
    items: catalogMenuItems(resting, zhTranslate, groups),
  });
  await act(async () =>
    document.body.querySelector<HTMLButtonElement>('[data-picker-filter="groups"]')!.click(),
  );
  const rest = zhTranslate('routingGroups.resting', {
    until: new Date(until).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  });
  expect(rows()).toEqual([
    `Daily${zhTranslate('modelMenu.groupFront', { model: 'GPT-6.1 · OpenAI' })}Ctrl+1`,
    `Flash only${rest}`,
  ]);
  const daily = document.body.querySelector("[data-picker-option='group:daily']");
  expect(daily?.getAttribute('aria-label')).toBe(
    `Daily · ${zhTranslate('modelMenu.groupFront', { model: 'GPT-6.1 · OpenAI' })}`,
  );
  expect(daily?.querySelector('[data-model-brand]')).not.toBeNull();
  expect(
    document.body
      .querySelector("[data-picker-option='group:flash-only']")
      ?.hasAttribute('disabled'),
  ).toBe(true);
  await act(async () =>
    document.body.querySelector<HTMLButtonElement>('[data-picker-filter="all"]')!.click(),
  );
  expect(rows()).toContain(`DeepSeek V4.1 FlashOpenCode Go · ${rest}`);
  expect(
    document.body
      .querySelector(`[data-picker-option='${key(catalog[0]!)}']`)
      ?.hasAttribute('disabled'),
  ).toBe(true);
  await act(async () =>
    document.body.querySelector<HTMLButtonElement>("[data-picker-favorite='group:daily']")!.click(),
  );
  expect(write).toHaveBeenCalledWith({ kind: 'group', id: 'daily' }, true);
  await act(async () =>
    document.body.querySelector<HTMLButtonElement>("[data-picker-option='group:daily']")!.click(),
  );
  expect(onSelect).toHaveBeenCalledWith('group:daily');
});

it('lists Presets in their own column with main and side models, checks the source and stars them (#4503)', async () => {
  const flash = { provider: catalog[0]!.provider, model: catalog[0]!.model };
  const gpt = { provider: catalog[1]!.provider, model: catalog[1]!.model };
  const groups = [{ id: 'daily', name: 'Daily', revision: 1, routes: [flash, gpt] }];
  const presets = [
    {
      id: 'fast',
      name: 'Fast',
      revision: 1,
      orchestrator: flash,
      assignmentDefault: gpt,
      createdAt: '2026-11-18T00:00:00.000Z',
    },
    {
      id: 'team',
      name: 'Team',
      revision: 1,
      orchestrator: flash,
      orchestratorGroupId: 'daily',
      assignmentDefault: flash,
      createdAt: '2026-11-18T00:00:00.000Z',
    },
  ];
  const write = vi.fn(async (choice: { kind: string }) => [
    choice as { kind: 'preset'; id: string },
  ]);
  rememberModelFavorites([], 'host', write);
  const { rows, onSelect } = await render({
    items: [
      ...presetMenuItems(presets, catalog, groups, 'team', zhTranslate),
      ...catalogMenuItems(catalog, zhTranslate, groups),
    ],
  });
  expect(rows().some((row) => row?.startsWith('Fast'))).toBe(false);
  await act(async () =>
    document.body.querySelector<HTMLButtonElement>('[data-picker-filter="presets"]')!.click(),
  );
  expect(rows()).toEqual([
    `Fast${zhTranslate('modelMenu.presetRoutes', { main: 'DeepSeek V4.1 Flash', side: 'GPT-6.1' })}Ctrl+1`,
    `Team${zhTranslate('modelMenu.presetRoutes', { main: 'Daily', side: 'DeepSeek V4.1 Flash' })}Ctrl+2`,
  ]);
  expect(zhTranslate('modelMenu.presetRoutes', { main: 'A', side: 'B' })).toBe('主：A · 副：B');
  const option = (id: string) => document.body.querySelector(`[data-picker-option='preset:${id}']`);
  expect(option('team')?.getAttribute('aria-selected')).toBe('true');
  expect(option('fast')?.getAttribute('aria-selected')).toBe('false');
  await act(async () =>
    document.body.querySelector<HTMLButtonElement>("[data-picker-favorite='preset:fast']")!.click(),
  );
  expect(write).toHaveBeenCalledWith({ kind: 'preset', id: 'fast' }, true);
  await act(async () => (option('fast') as HTMLButtonElement).click());
  expect(onSelect).toHaveBeenCalledWith('preset:fast');
});

it('filters subscription models by engine and exposes only applicable actions', async () => {
  const engines = [
    { engine: 'codex', installed: true, available: true },
    { engine: 'claude', installed: true, available: false, reason: 'signed-out' },
  ] satisfies EngineStatusView[];
  const models = { codex: [{ id: 'gpt-6', name: 'GPT-6 Subscription', efforts: [] }] };
  const items = engineMenuItems(engines, models, undefined, zhTranslate);
  expect(items).toMatchObject([
    { value: 'engine:codex:gpt-6', engine: 'codex', brand: 'openai' },
    { value: 'engine-signin:claude', engine: 'claude', brand: 'claude', disabled: false },
  ]);
  expect(
    engineMenuItems(
      [{ engine: 'codex', installed: false, available: false, reason: 'not-installed' }],
      {},
      undefined,
      zhTranslate,
    ),
  ).toMatchObject([
    {
      engine: 'codex',
      disabled: true,
      hint: zhTranslate('engine.notInstalled', { engine: 'Codex' }),
    },
  ]);
  expect(engineMenuItems([], {}, undefined, zhTranslate)).toEqual([]);
  const { rows, onSelect } = await render({
    items: [...catalogMenuItems(catalog, zhTranslate), ...items],
  });
  const rail = document.querySelector<HTMLButtonElement>('[data-picker-filter="engine:codex"]')!;
  expect(rail.getAttribute('aria-label')).toBe('Codex 订阅');
  await act(async () => rail.click());
  expect(rows()).toEqual(['GPT-6 SubscriptionCtrl+1']);
  const signInFilter = document.querySelector<HTMLButtonElement>(
    '[data-picker-filter="engine:claude"]',
  )!;
  await act(async () => signInFilter.click());
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[data-picker-option="engine-signin:claude"]')!
      .click(),
  );
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('engine-signin:claude');
});
