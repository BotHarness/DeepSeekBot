// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));
vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, SvgXml: () => null }));
vi.mock('../src/ui/chat/sheet', () => ({ SHEET_GROUP: 'raised' }));

import type { ModelSettingsState } from '@botharness/host-client/model-settings';
import type { SubChoices } from '@botharness/host-client/preset-sub';
import { SubChoiceSection } from '../src/ui/chat/sub-choice-section';
import { subChoiceView } from '../src/ui/chat/sub-choice-text';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

const flash = {
  provider: 'deepseek',
  providerName: 'DeepSeek',
  model: 'flash',
  modelName: 'Flash',
  efforts: [{ id: 'high', name: 'High' }],
};
const pro = { provider: 'deepseek', providerName: 'DeepSeek', model: 'pro', modelName: 'Pro' };
const group = { id: 'fast', name: 'Fast group', revision: 1, routes: [flash] };

function state(
  sub: SubChoices | undefined,
  presets: ModelSettingsState['presets'] = [],
): ModelSettingsState {
  return {
    revision: 1,
    models: [flash, pro],
    groups: [group],
    presets,
    ...(sub === undefined
      ? {}
      : {
          plan: {
            revision: 2,
            sourcePresetId: '',
            sourcePresetName: '',
            orchestrator: { provider: 'deepseek', model: 'pro' },
            sub,
          },
        }),
  };
}

async function render(value: ModelSettingsState) {
  const onOpen = vi.fn();
  const onAdd = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(<SubChoiceSection value={value} busy={false} onOpen={onOpen} onAdd={onAdd} />),
  );
  return { view: host, onOpen, onAdd };
}

const row = (view: HTMLElement, id: string) =>
  view.querySelector<HTMLElement>(`[data-testid="${id}"]`);

it('lists each choice with its source and effort, marks the default and opens a choice', async () => {
  const sub: SubChoices = {
    choices: [
      {
        kind: 'model',
        provider: 'deepseek',
        model: 'flash',
        allowedEfforts: ['', 'high'],
        defaultEffort: 'high',
      },
      { kind: 'group', group: 'fast' },
    ],
    default: { kind: 'group', group: 'fast' },
  };
  const { view, onOpen, onAdd } = await render(state(sub));
  expect(view.textContent).toContain('Flash');
  expect(view.textContent).toContain('DeepSeek · High');
  expect(view.textContent).toContain('Fast group');
  const groupRow = [...view.querySelectorAll('[role="button"]')].find((node) =>
    node.getAttribute('aria-label')?.startsWith('Fast group'),
  );
  expect(groupRow?.getAttribute('aria-label')).toContain(t.routingGroup.defaultTag);
  await act(async () => (groupRow as HTMLElement).click());
  expect(onOpen).toHaveBeenCalledWith({ kind: 'group', group: 'fast' });
  await act(async () => row(view, 'sub-choice-add')!.click());
  expect(onAdd).toHaveBeenCalledOnce();
});

it('shows the follows-main row for an empty list and the inherited note for a Bot without its own list', async () => {
  const own = await render(state({ choices: [], default: null }));
  expect(row(own.view, 'sub-choice-follows-main')).not.toBeNull();
  expect(own.view.textContent).toContain(t.subChoices.hint);
  act(() => root?.unmount());
  host?.remove();
  const inherited = await render(
    state(undefined, [
      {
        id: 'default',
        name: 'Default',
        revision: 1,
        orchestrator: { provider: 'deepseek', model: 'pro' },
        assignmentDefault: { provider: 'deepseek', model: 'flash' },
      },
    ]),
  );
  expect(inherited.view.textContent).toContain(t.subChoices.inherited);
  expect(inherited.view.textContent).toContain('Flash');
});

it('names engine choices from the loaded account catalog', () => {
  const view = subChoiceView(
    state({ choices: [], default: null }),
    { kind: 'engine', engine: 'codex', accountId: 'work', model: 'gpt-6', effort: 'high' },
    [
      {
        engine: 'codex',
        accountId: 'work',
        accountName: 'Work',
        available: true,
        models: [{ id: 'gpt-6', name: 'GPT-6', efforts: [{ id: 'high', name: 'High' }] }],
      },
    ],
  );
  expect(view.external).toBe(true);
  expect(view.detail).toContain('Work');
  expect(view.detail).toContain('High');
});
