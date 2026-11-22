import { act } from 'react';
import { vi } from 'vitest';
import { en } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  return {
    ...(await import('./primitive-mocks.js')).shellPrimitives(),

    useAnchoredPosition: () => ({ top: 0, left: 0 }),
    useDismissOnOutsidePointer: () => undefined,
  };
});

export function translate(key: string, params?: Record<string, unknown>): string {
  let text = (en as Record<string, string>)[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {}))
    text = text.replace(`{${name}}`, String(value));
  return text;
}

export const catalog = [
  {
    provider: 'deepseek',
    providerName: 'DeepSeek',
    model: 'flash',
    modelName: 'Flash',
    efforts: [
      { id: 'low', name: 'Low' },
      { id: 'high', name: 'High' },
    ],
  },
  {
    provider: 'deepseek',
    providerName: 'DeepSeek',
    model: 'pro',
    modelName: 'Pro',
    efforts: [],
  },
  {
    provider: 'kimi',
    providerName: 'Moonshot',
    model: 'k2',
    modelName: 'Kimi K2',
    efforts: [],
  },
];

export const cards = (host: HTMLElement): string =>
  document.body.querySelector('.bh-model-entry .bh-card-list')?.textContent ?? '';

export async function openEditor(host: HTMLElement): Promise<void> {
  await act(async () => {
    document.body.querySelector<HTMLButtonElement>('.bh-model-entry button.bh-card-main')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button, [role="menuitem"]')].find(
    (candidate) => candidate.textContent === text,
  );
  if (found === undefined) throw new Error(`No button ${text}`);
  return found;
}

function combobox(label: string): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>(
    `input[role="combobox"][aria-label="${label}"]`,
  );
  if (found === null) throw new Error(`No combobox ${label}`);
  return found;
}

export function trigger(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('button[data-picker-trigger]')].find(
    (candidate) => {
      const name = candidate.getAttribute('aria-label') ?? '';
      return name === label || name.startsWith(`${label} · `);
    },
  );
}

export function picked(label: string): string {
  const found = trigger(label);
  if (found === undefined) throw new Error(`No model picker ${label}`);
  return found.title || (found.textContent ?? '');
}

export async function openPicker(label: string): Promise<void> {
  const found = trigger(label);
  if (found === undefined) throw new Error(`No model picker ${label}`);
  await act(async () => found.click());
}

async function search(input: HTMLInputElement, query: string): Promise<void> {
  await act(async () => input.focus());
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export async function choose(label: string, query: string, option: string): Promise<void> {
  if (trigger(label) === undefined) {
    await search(combobox(label), query);
  } else {
    await openPicker(label);
    const field = document.querySelector<HTMLInputElement>(
      '[data-filter-picker] input[role="combobox"]',
    );
    if (field === null) throw new Error(`No model search for ${label}`);
    await search(field, query);
  }
  const match = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (candidate) => (candidate.title || candidate.textContent || '').startsWith(option),
  );
  if (match === undefined) throw new Error(`No option ${option} for ${query}`);
  await act(async () => match.click());
}

export function taskTiles(): string[] {
  return [
    ...document.querySelectorAll('section[aria-label="Task model"] [data-list-card] > li'),
  ].map((tile) => tile.textContent ?? '');
}

export async function addTask(query: string, option: string): Promise<void> {
  await choose('Add an allowed model', query, option);
}

export const followsMain = { choices: [], default: null };

export function modelSub(
  ...models: { provider: string; model: string; effort?: string; note?: string }[]
) {
  return {
    choices: models.map(({ provider, model, effort = '', note }) => ({
      kind: 'model' as const,
      provider,
      model,
      allowedEfforts: [effort],
      defaultEffort: effort,
      ...(note === undefined ? {} : { note }),
    })),
    default:
      models[0] === undefined
        ? null
        : { kind: 'model' as const, provider: models[0].provider, model: models[0].model },
  };
}

export function labelled(label: string): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (found === null) throw new Error(`No button labelled ${label}`);
  return found;
}
