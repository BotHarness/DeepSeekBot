// @vitest-environment jsdom
import type { ModelCatalogAnswer } from '@botharness/host-client/model-catalog';
import type { RoutingGroupEngineOptions } from '@botharness/host-protocol/subscription-engine';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { SettingsRowProps } from '../src/ui/primitives/settings-row-model';
import { t } from '../src/ui/strings';
import { ModelGroupPickerRow } from '../src/ui/chat/model-picker-row';
import { RoutingGroupEditorRoute } from '../src/ui/chat/routing-group-editor';
import { RoutingGroupMemberRow } from '../src/ui/chat/routing-group-member-row';

const { back, device } = vi.hoisted(() => ({ back: vi.fn(), device: { fontScale: 1 } }));
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return {
    ...shim,
    Dimensions: {
      ...shim.Dimensions,
      get: () => ({ ...shim.useWindowDimensions(), fontScale: device.fontScale }),
    },
  };
});
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
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
  SheetActions: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetNote: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  SheetCallout: ({ children }: { children: ReactNode }) => <div role="alert">{children}</div>,
  SheetLoading: () => <span role="status" />,
  SheetFailed: ({ message, onRetry }: { message: string; onRetry(): void }) => (
    <div>
      <span role="alert">{message}</span>
      <button type="button" onClick={onRetry}>
        {t.tryAgain}
      </button>
    </div>
  ),
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
    tone,
  }: SettingsRowProps) => (
    <div>
      <button
        type="button"
        aria-label={accessibilityLabel}
        disabled={onPress === undefined}
        onClick={onPress}
        data-testid={testID}
        data-tone={tone}
      >
        {leading === undefined ? null : <span data-row-slot="leading">{leading}</span>}
        {title}
        <span data-row-slot="detail">{detail}</span>
        {trailing === undefined ? null : <span data-row-slot="trailing">{trailing}</span>}
      </button>
      {accessory === undefined ? null : <div data-row-slot="accessory">{accessory}</div>}
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
vi.mock('../src/ui/primitives/system-symbol', () => ({
  SystemSymbol: ({ name }: { name: { ios: string } }) => <span data-symbol={name.ios} />,
}));
vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));
vi.mock('../src/ui/primitives/swipe-row', () => ({
  SwipeRow: ({ children }: { children: ReactNode }) => <div data-member-row>{children}</div>,
}));
vi.mock('../src/ui/primitives/search-field', async () => {
  const { TextInput } = await import('./react-native-shim');
  return { SearchField: TextInput };
});
vi.mock('../src/ui/primitives/text-field', async () => {
  const { TextInput } = await import('./react-native-shim');
  return { TextField: TextInput };
});
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
const codexModel = {
  id: 'gpt-5.4',
  name: 'GPT-5.4',
  isDefault: true,
  defaultEffort: 'medium',
  efforts: [
    { id: 'medium', name: 'Medium' },
    { id: 'high', name: 'High' },
  ],
};
const sonnetModel = { id: 'claude-sonnet-5-5', name: 'Sonnet', isDefault: true, efforts: [] };
const dsh = { kind: 'model', ...model } as const;
const group = { id: 'daily', name: 'Daily', revision: 2, members: [dsh, claude], routes: [model] };
const catalog = { models: [entry], groups: [group] } satisfies ModelCatalogAnswer;

let view: HTMLDivElement;
let root: Root;
beforeEach(() => {
  device.fontScale = 1;
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

async function typeInto(testID: string, value: string) {
  const input = view.querySelector(`[data-testid="${testID}"]`);
  if (!(input instanceof HTMLTextAreaElement)) throw new Error(`Missing field ${testID}`);
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const engineRow = {
  name: 'GPT-6.2-Sol',
  title: 'GPT-6.2-Sol',
  brand: 'openai',
  detail: `Codex · ${t.routingGroup.engineRow.subscription('ChatGPT')} · High`,
  isDefault: true,
  unavailable: false,
} as const;

it('gives the editor engine title and details the trailing space at default text size', async () => {
  await act(async () =>
    root.render(
      <RoutingGroupMemberRow
        index={1}
        name={engineRow.name}
        title={engineRow.title}
        detail={undefined}
        brand={undefined}
        engineRow={engineRow}
        engineReason={undefined}
        usable
        moveUp={() => {}}
        moveDown={undefined}
        remove={() => {}}
      />,
    ),
  );
  const row = view.querySelector('[data-member-row]');
  expect(row?.querySelector('button')?.textContent).toBe(
    `2. GPT-6.2-Sol${engineRow.detail} · ${t.routingGroup.defaultTag}`,
  );
  expect(row?.querySelector('[data-row-slot="detail"]')?.textContent).toBe(
    `${engineRow.detail} · ${t.routingGroup.defaultTag}`,
  );
  expect(
    row?.querySelector('[data-row-slot="leading"] [data-symbol]')?.getAttribute('data-symbol'),
  ).toBe('puzzlepiece.extension');
  expect(row?.querySelector('[data-row-slot="trailing"]')).toBeNull();
  expect(
    button('routing-group-member-1-remove')
      .closest('[data-row-slot]')
      ?.getAttribute('data-row-slot'),
  ).toBe('accessory');
});

it.each([1.6, 3.12])('puts all member controls below the text at scale %s', async (fontScale) => {
  device.fontScale = fontScale;
  const up = vi.fn();
  const down = vi.fn();
  const remove = vi.fn();
  await act(async () =>
    root.render(
      <>
        {['V4.1 Flash', 'Daily', engineRow.name].map((name, index) => (
          <RoutingGroupMemberRow
            key={name}
            index={index}
            name={name}
            title={name}
            detail={index === 0 ? entry.providerName : t.routingGroup.group}
            brand={index === 0 ? 'deepseek' : undefined}
            engineRow={index === 2 ? engineRow : undefined}
            engineReason={undefined}
            usable
            moveUp={up}
            moveDown={down}
            remove={remove}
          />
        ))}
      </>,
    ),
  );
  const rows = [...view.querySelectorAll('[data-member-row]')];
  expect(rows).toHaveLength(3);
  for (const [index, row] of rows.entries()) {
    const [label, controls] = row.children;
    expect(label?.textContent).toMatch(new RegExp(`^${index + 1}\\. `, 'u'));
    expect(label?.querySelector('[data-row-slot="accessory"]')).toBeNull();
    for (const action of ['up', 'down', 'remove']) {
      const testID = `routing-group-member-${index}-${action}`;
      expect(controls?.contains(button(testID))).toBe(true);
      await click(testID);
    }
  }
  expect(up).toHaveBeenCalledTimes(3);
  expect(down).toHaveBeenCalledTimes(3);
  expect(remove).toHaveBeenCalledTimes(3);
});

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

it('uses separate source chips, searches both engines and saves a model with effort', async () => {
  const editable = { ...group, members: [dsh, claude] };
  const call = vi.fn(async (method: string, args?: Record<string, unknown>) => {
    if (method === 'modelCatalog')
      return args?.['includeRoutingGroupEngines'] === true
        ? {
            ...catalog,
            routingGroupEngines: [
              { engine: 'codex', available: true, models: [codexModel] },
              { engine: 'claude', available: true, models: [sonnetModel] },
            ],
          }
        : catalog;
    if (method === 'modelGroup' || method === 'modelGroupUpdate') return { group: editable };
    throw new Error(`Unexpected Host call ${method}`);
  });
  await act(async () => root.render(<RoutingGroupEditorRoute client={{ call }} id={group.id} />));
  expect(view.textContent).toMatch(/Sonnet.*Default/u);
  await click('routing-group-add-member');
  await click('routing-member-filter-claude');
  expect(button('routing-member-engine-claude-claude-sonnet-5-5').textContent).toContain(
    t.routingGroup.defaultTag,
  );
  expect(view.querySelector('[data-testid="routing-member-engine-codex-gpt-5.4"]')).toBeNull();
  await click('routing-member-filter-codex');
  expect(button('routing-member-engine-codex-gpt-5.4').textContent).toContain(
    t.routingGroup.defaultTag,
  );
  expect(
    view.querySelector('[data-testid="routing-member-engine-claude-claude-sonnet-5-5"]'),
  ).toBeNull();
  await click('routing-member-filter-all');
  await typeInto('routing-group-member-search', 'Codex GPT-5.4');
  expect(
    view.querySelector('[data-testid="routing-member-engine-claude-claude-sonnet-5-5"]'),
  ).toBeNull();
  await click('routing-member-engine-codex-gpt-5.4');
  expect(view.querySelector('[aria-label="Medium"]')?.getAttribute('aria-selected')).toBe('true');
  await act(async () => view.querySelector<HTMLButtonElement>('[aria-label="High"]')?.click());
  await click('routing-member-confirm');
  expect(view.textContent).toMatch(/GPT-5.4.*High/u);
  await click('routing-group-member-2-up');
  await click('routing-group-member-2-remove');
  await click('routing-group-save');
  expect(call).toHaveBeenCalledWith('modelGroupUpdate', {
    id: 'daily',
    expectedRevision: 2,
    name: 'Daily',
    members: [dsh, { ...codex, reasoningEffort: 'high' }],
  });
  expect(back).toHaveBeenCalledOnce();
});

it.each(['signed-out', 'not-installed'] as const)(
  'numbers all member types and dims a saved %s engine',
  async (reason) => {
    const nested = { ...group, id: 'nested', name: 'Nested' };
    const mixed = { ...group, members: [dsh, { kind: 'group', id: nested.id }, codex, claude] };
    const call = vi.fn(async (method: string, args?: Record<string, unknown>) => {
      if (method === 'modelGroup') return { group: mixed };
      if (args?.['includeRoutingGroupEngines'] === true)
        return { routingGroupEngines: [{ engine: 'claude', available: false, reason }] };
      return { ...catalog, groups: [mixed, nested] };
    });
    await act(async () => root.render(<RoutingGroupEditorRoute client={{ call }} id={group.id} />));
    const rows = [...view.querySelectorAll('button[aria-label]')].filter((row) =>
      /^\d+\./u.test(row.getAttribute('aria-label') ?? ''),
    );
    expect(rows.map((row) => row.textContent)).toEqual([
      '1. V4.1 FlashOpenCode Go',
      `2. Nested${t.routingGroup.group}`,
      `3. GPT-5.4Codex · ${t.routingGroup.engineRow.subscription('ChatGPT')}`,
      `4. ${t.routingGroup.engineRow.defaultModel('Claude Code')}Claude Code · ${t.routingGroup.engineRow.subscription('Claude')} · ${t.routingGroup.unavailable} · ${t.routingGroup.engineUnavailable[reason]}`,
    ]);
    expect(rows[3]?.getAttribute('data-tone')).toBe('muted');
    expect(button('routing-group-member-3-remove').disabled).toBe(false);
  },
);

it('retries the engine catalog in place, searches across fields and keeps the draft', async () => {
  const editable = { ...group, members: [dsh] };
  const readEngines = vi
    .fn()
    .mockRejectedValueOnce(new Error('Disconnected'))
    .mockResolvedValue([
      { engine: 'codex', available: true, models: [{ id: 'gpt-5.4', name: 'GPT-5.4' }] },
    ]);
  const call = vi.fn(async (method: string, args?: Record<string, unknown>) => {
    if (method !== 'modelCatalog') return { group: editable };
    if (args?.['includeRoutingGroupEngines'] === true)
      return { ...catalog, routingGroupEngines: await readEngines() };
    return catalog;
  });
  await act(async () => root.render(<RoutingGroupEditorRoute client={{ call }} id={group.id} />));
  await typeInto('routing-group-name', 'Renamed draft');
  await click('routing-group-add-member');
  await click('routing-member-filter-codex');
  await typeInto('routing-group-member-search', 'Codex GPT-5.4');
  expect(view.querySelector('[role="alert"]')?.textContent).toBe(t.routingGroup.enginesUnavailable);
  const retry = [...view.querySelectorAll('button')].find(
    (item) => item.textContent === t.tryAgain,
  );
  expect(retry).toBeDefined();
  await act(async () => retry?.click());
  expect(readEngines).toHaveBeenCalledTimes(2);
  expect(button('routing-member-engine-codex-gpt-5.4').disabled).toBe(false);
  expect(view.querySelector('[data-testid="routing-member-engine-codex-default"]')).toBeNull();
  await typeInto('routing-group-member-search', 'gpt-5.4');
  await click('routing-member-engine-codex-gpt-5.4');
  await click('routing-group-save');
  expect(call).toHaveBeenCalledWith('modelGroupUpdate', {
    id: group.id,
    expectedRevision: group.revision,
    name: 'Renamed draft',
    members: [dsh, codex],
  });
});

it('shows a successful empty catalog without a retry action', async () => {
  const call = vi.fn(async (method: string) =>
    method === 'modelGroup'
      ? { group: { ...group, members: [dsh] } }
      : { ...catalog, routingGroupEngines: [] },
  );
  await act(async () => root.render(<RoutingGroupEditorRoute client={{ call }} id={group.id} />));
  await click('routing-group-add-member');
  await click('routing-member-filter-codex');
  expect(view.querySelector('[role="dialog"]')?.textContent).toContain(t.routingGroup.noEngines);
  expect(view.querySelector('[role="alert"]')).toBeNull();
  expect(view.querySelector('[role="dialog"]')?.textContent).not.toContain(t.tryAgain);
});

it('refreshes availability when the engine filter reopens and keeps the last choices visible', async () => {
  const fresh = Promise.withResolvers<RoutingGroupEngineOptions[]>();
  const readEngines = vi
    .fn()
    .mockResolvedValueOnce([{ engine: 'claude', available: false, reason: 'signed-out' }])
    .mockReturnValueOnce(fresh.promise);
  const call = vi.fn(async (method: string, args?: Record<string, unknown>) => {
    if (method === 'modelGroup') return { group: { ...group, members: [dsh] } };
    if (args?.['includeRoutingGroupEngines'] === true)
      return { ...catalog, routingGroupEngines: await readEngines() };
    return catalog;
  });
  await act(async () => root.render(<RoutingGroupEditorRoute client={{ call }} id={group.id} />));
  await typeInto('routing-group-name', 'Renamed draft');
  await click('routing-group-add-member');
  await click('routing-member-filter-claude');
  expect(view.querySelector('[role="dialog"]')?.textContent).toContain(
    t.routingGroup.engineUnavailable['signed-out'],
  );
  await click('routing-member-filter-all');
  await click('routing-member-filter-claude');
  expect(readEngines).toHaveBeenCalledTimes(2);
  expect(view.querySelector('[role="dialog"]')?.textContent).toContain(
    t.routingGroup.engineUnavailable['signed-out'],
  );
  await act(async () =>
    fresh.resolve([{ engine: 'claude', available: true, models: [sonnetModel] }]),
  );
  expect(button('routing-member-engine-claude-claude-sonnet-5-5').disabled).toBe(false);
  expect(view.querySelector('[role="dialog"]')?.textContent).not.toContain(
    t.routingGroup.engineUnavailable['signed-out'],
  );
  expect(view.querySelector('[data-testid="routing-group-name"]')).toHaveProperty(
    'value',
    'Renamed draft',
  );
});
