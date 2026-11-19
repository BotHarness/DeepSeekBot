// @vitest-environment jsdom
import type { ModelCatalogAnswer } from '@botharness/host-client/model-catalog';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { SettingsRowProps } from '../src/ui/primitives/settings-row-model';
import { t } from '../src/ui/strings';
import { ModelGroupPickerRow } from '../src/ui/chat/model-picker-row';
import { RoutingGroupEditorRoute } from '../src/ui/chat/routing-group-editor';

const { back } = vi.hoisted(() => ({ back: vi.fn() }));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('expo-router', async () => {
  const { useEffect } = await import('react');
  return {
    Stack: {
      Screen: ({ options }: { options: { headerRight(): ReactNode } }) => options.headerRight(),
    },
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
    usePreventRemove: vi.fn(),
    useRouter: () => ({ back }),
  };
});
vi.mock('../src/ui/chat/sheet', () => ({
  SHEET_GROUP: 'sheet',
  Sheet: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div>,
  SheetNote: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  SheetCallout: ({ children }: { children: ReactNode }) => <div role="alert">{children}</div>,
  SheetLoading: () => <span role="status" />,
}));
vi.mock('../src/ui/primitives/settings-row', () => ({
  SettingsGroupItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SettingsHeading: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SettingsRow: ({
    title,
    detail,
    onPress,
    leading,
    trailing,
    accessory,
    accessibilityLabel,
    testID,
  }: SettingsRowProps) => (
    <div>
      <button
        type="button"
        aria-label={accessibilityLabel}
        disabled={onPress === undefined}
        onClick={onPress}
        data-testid={testID}
      >
        {leading}
        {title}
        <span>{detail}</span>
        {trailing}
      </button>
      {accessory}
    </div>
  ),
}));
vi.mock('../src/ui/primitives/sheet-page', () => ({
  SheetPage: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('../src/ui/primitives/sheet-save-button', () => ({
  SheetSaveButton: ({
    testID,
    disabled,
    onPress,
  }: {
    testID: string;
    disabled: boolean;
    onPress(): void;
  }) => (
    <button type="button" data-testid={testID} disabled={disabled} onClick={onPress}>
      Save
    </button>
  ),
}));
vi.mock('../src/ui/primitives/system-symbol', () => ({ SystemSymbol: () => null }));
vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));
vi.mock('../src/ui/primitives/swipe-row', () => ({
  SwipeRow: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/ui/primitives/search-field', () => ({ SearchField: () => null }));
vi.mock('../src/ui/primitives/text-field', () => ({ TextField: () => null }));
vi.mock('../src/ui/primitives/keyboard-form', () => ({ renderKeyboardFormScroll: vi.fn() }));
vi.mock('../src/ui/primitives/app-dialog', () => ({ confirmDestructive: vi.fn() }));
vi.mock('../src/ui/shell/icons', () => import('./shell-icons-shim'));
vi.mock('../src/ui/chat/model-brand-icon', () => ({
  ModelBrandIcon: ({ brand }: { brand: string }) => <span data-model-brand={brand} />,
}));

const model = { provider: 'opencode-go', model: 'deepseek-v4.1-flash' };
const entry = { ...model, modelName: 'DeepSeek V4.1 Flash', providerName: 'OpenCode Go' };
const codex = { kind: 'engine', engine: 'codex', model: 'gpt-5.4' } as const;
const claude = { kind: 'engine', engine: 'claude' } as const;
const dsh = { kind: 'model', ...model } as const;
const group = { id: 'daily', name: 'Daily', revision: 2, members: [dsh, claude], routes: [model] };
const catalog = { models: [entry], groups: [group] } satisfies ModelCatalogAnswer;

let view: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  view = document.createElement('div');
  document.body.append(view);
  root = createRoot(view);
});
afterEach(async () => {
  await act(async () => root.unmount());
  view.remove();
  vi.unstubAllGlobals();
  back.mockClear();
});

function button(testID: string) {
  const node = view.querySelector(`[data-testid="${testID}"]`);
  if (!(node instanceof HTMLButtonElement)) throw new Error(`Missing button ${testID}`);
  return node;
}

async function click(testID: string) {
  await act(async () => button(testID).click());
}

it('shows the current model on the phone group row and announces all full member names', async () => {
  const mixed = { ...group, members: [dsh, codex, claude] };
  await act(async () =>
    root.render(
      <ModelGroupPickerRow
        group={mixed}
        front={entry}
        models={catalog.models}
        groups={[mixed]}
        usable
        showCount={false}
        onPress={() => {}}
        testID="group"
      />,
    ),
  );
  const row = button('group');
  expect(row.textContent).toBe(`Daily${t.modelSettings.groupFront('V4.1 Flash')}`);
  expect(row.getAttribute('aria-label')).toBe(
    [
      'Daily',
      t.modelSettings.groupFront('DeepSeek V4.1 Flash · OpenCode Go'),
      'DeepSeek V4.1 Flash · OpenCode Go',
      `GPT-5.4 · Codex · ${t.routingGroup.engineRow.subscription('ChatGPT')}`,
      `${t.routingGroup.engineRow.defaultModel('Claude Code')} · Claude Code · ${t.routingGroup.engineRow.subscription('Claude')}`,
    ].join(', '),
  );
  expect(row.querySelector('[data-model-brand="deepseek"]')).not.toBeNull();
});

it('adds a ready engine model, moves it, removes the default engine and saves the ordered members', async () => {
  const call = vi.fn(async (method: string, args?: Record<string, unknown>) => {
    if (method === 'modelCatalog')
      return args?.['includeRoutingGroupEngines'] === true
        ? {
            ...catalog,
            routingGroupEngines: [
              { engine: 'codex', available: true, models: [{ id: 'gpt-5.4', name: 'GPT-5.4' }] },
              { engine: 'claude', available: false, reason: 'signed-out' },
            ],
          }
        : catalog;
    if (method === 'modelGroup' || method === 'modelGroupUpdate') return { group };
    throw new Error(`Unexpected Host call ${method}`);
  });
  const editable = { ...group, members: [dsh] };
  const editorCall = vi.fn((method: string, args?: Record<string, unknown>) =>
    method === 'modelGroup' ? Promise.resolve({ group: editable }) : call(method, args),
  );
  await act(async () =>
    root.render(<RoutingGroupEditorRoute client={{ call: editorCall }} id={group.id} />),
  );
  await click('routing-group-add-member');
  await click('routing-member-filter-engines');
  expect(button('routing-member-engine-claude-default').disabled).toBe(true);
  expect(button('routing-member-engine-claude-default').textContent).toContain(
    t.routingGroup.engineUnavailable['signed-out'],
  );
  await click('routing-member-engine-codex-default');
  await click('routing-group-add-member');
  await click('routing-member-filter-engines');
  await click('routing-member-engine-codex-gpt-5.4');
  await click('routing-group-member-2-up');
  await click('routing-group-member-2-remove');
  await click('routing-group-save');
  expect(call).toHaveBeenCalledWith('modelGroupUpdate', {
    id: 'daily',
    expectedRevision: 2,
    name: 'Daily',
    members: [dsh, codex],
  });
  expect(back).toHaveBeenCalledOnce();
});
