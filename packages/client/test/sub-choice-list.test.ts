// @vitest-environment jsdom
import { catalog, choose, translate } from './model-preset-profile-fixtures.js';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { SubChoiceList } from '../src/client/sub-choice-list.js';
import type { SubChoices } from '../src/client/sub-choices.js';

let root: Root | undefined;
afterEach(async () => {
  if (root !== undefined) await act(async () => root!.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

const options = catalog.map((entry) => ({
  value: JSON.stringify([entry.provider, entry.model]),
  label: entry.modelName,
}));

async function render(initial: SubChoices): Promise<{ current(): SubChoices }> {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let latest = initial;
  function Harness() {
    const [sub, setSub] = useState(initial);
    latest = sub;
    return createElement(SubChoiceList, {
      sub,
      catalog,
      catalogGroups: [],
      modelOptions: options,
      busy: false,
      onChange: setSub,
      t: translate,
    });
  }
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(Harness)));
  return { current: () => latest };
}

const tiles = () =>
  [...document.querySelectorAll('[data-list-card] > li')].map((tile) => tile.textContent ?? '');
const byLabel = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

it('shows "same as main model" when empty and makes the first added choice the default', async () => {
  const view = await render({ choices: [], default: null });
  expect(tiles()).toEqual([expect.stringContaining('Same as main model')]);
  await choose('Add a task model', 'Flash', 'Flash');
  await choose('Add a task model', 'Kimi', 'Kimi K2');
  expect(view.current().default).toEqual({ kind: 'model', provider: 'deepseek', model: 'flash' });
  expect(view.current().choices.map((choice) => choice.kind === 'model' && choice.model)).toEqual([
    'flash',
    'k2',
  ]);
  expect(tiles()[0]).toContain('Default');
  expect(tiles()[1]).toContain('Make default');
});

it('moves the default to the next choice when the default is removed, and back to main when empty', async () => {
  const view = await render({
    choices: [
      {
        kind: 'model',
        provider: 'deepseek',
        model: 'flash',
        allowedEfforts: ['', 'low', 'high'],
        defaultEffort: '',
      },
      { kind: 'model', provider: 'kimi', model: 'k2', allowedEfforts: [''], defaultEffort: '' },
    ],
    default: { kind: 'model', provider: 'deepseek', model: 'flash' },
  });
  await act(async () => byLabel('Remove Flash').click());
  expect(view.current().default).toEqual({ kind: 'model', provider: 'kimi', model: 'k2' });
  await act(async () => byLabel('Remove Kimi K2').click());
  expect(view.current()).toEqual({ choices: [], default: null });
  expect(tiles()).toEqual([expect.stringContaining('Same as main model')]);
});

it('edits a choice effort and note in its expanded tile and keeps the effort allowed', async () => {
  const view = await render({
    choices: [
      {
        kind: 'model',
        provider: 'deepseek',
        model: 'flash',
        allowedEfforts: [''],
        defaultEffort: '',
      },
    ],
    default: { kind: 'model', provider: 'deepseek', model: 'flash' },
  });
  await act(async () => byLabel('Edit Flash').click());
  const high = [...document.querySelectorAll<HTMLElement>('[role="radio"], button')].find(
    (node) => node.textContent === 'High',
  )!;
  await act(async () => high.click());
  expect(view.current().choices[0]).toMatchObject({
    defaultEffort: 'high',
    allowedEfforts: ['', 'high'],
  });
  expect(tiles()[0]).toContain('High');
});

it('expands a tile inside a form without submitting the form', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const submit = vi.fn((event: Event) => event.preventDefault());
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      createElement(
        'form',
        { onSubmit: (event: { nativeEvent: Event }) => submit(event.nativeEvent) },
        createElement(SubChoiceList, {
          sub: {
            choices: [
              {
                kind: 'model',
                provider: 'deepseek',
                model: 'flash',
                allowedEfforts: [''],
                defaultEffort: '',
              },
            ],
            default: { kind: 'model', provider: 'deepseek', model: 'flash' },
          },
          catalog,
          catalogGroups: [],
          modelOptions: options,
          busy: false,
          onChange: () => undefined,
          t: translate,
        }),
      ),
    ),
  );
  await act(async () => byLabel('Edit Flash').click());
  expect(submit).not.toHaveBeenCalled();
  expect(document.querySelector('input[aria-label="When to use Flash"]')).not.toBeNull();
});
