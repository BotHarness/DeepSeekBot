// @vitest-environment jsdom
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./primitive-mocks.js')).comboboxPrimitives(),
);

import { modelFamilies } from '@botharness/host-client/shared/model-brand';
import type { ModelCatalogEntryView } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { ModelMenu, catalogMenuItems } from '../src/client/model-menu.js';

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

it('lists models with their family logo, short name and provider, usable ones first', async () => {
  const { rows } = await render();
  expect(rows()).toEqual([
    'V4.1 FlashOpenCode Go',
    '6.1OpenAI',
    'house-modelLab',
    `Opus${zhTranslate('modelPreset.credentialMissing', { provider: 'Anthropic' })}`,
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
  expect(rows()).toEqual(['6.1OpenAI']);
  await act(async () =>
    document.body.querySelector<HTMLButtonElement>('[data-picker-filter="all"]')!.click(),
  );
  const search = document.body.querySelector<HTMLInputElement>('[role="combobox"]')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(search, 'house');
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(rows()).toEqual(['house-modelLab']);
});

it('chooses with the keyboard and closes when there is no effort to pick', async () => {
  const { onSelect, onClose } = await render();
  const search = document.body.querySelector<HTMLInputElement>('[role="combobox"]')!;
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
