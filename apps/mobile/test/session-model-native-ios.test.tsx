// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

type Modifier = {
  label?: string;
  disabled?: boolean;
  title?: string;
  detents?: string[];
  selection?: string;
  onSelectionChange?: (detent: string) => void;
  redacted?: boolean;
};

const detentChange = vi.hoisted(() => ({
  current: undefined as ((d: string) => void) | undefined,
}));

const os = vi.hoisted(() => ({ version: '26.0' }));
vi.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    get Version() {
      return os.version;
    },
  },
  PlatformColor: (name: string) => name,
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({
    scheme: 'light',
    color: { muted: 'gray', accent: 'blue' },
    type: { title: { line: 22 } },
  }),
}));
vi.mock('../src/ui/chat/model-brand-icon', () => ({
  ModelBrandIcon: ({ brand }: { brand?: string }) => createElement('i', { 'data-brand': brand }),
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => {
  const none = () => ({});
  return {
    accessibilityLabel: (label: string) => ({ label }),
    disabled: (value: boolean) => ({ disabled: value }),
    font: none,
    foregroundStyle: none,
    frame: none,
    listStyle: none,
    navigationBarTitleDisplayMode: none,
    navigationTitle: (title: string) => ({ title }),
    presentationDetents: (
      detents: string[],
      options?: { selection?: string; onSelectionChange?: (detent: string) => void },
    ) => {
      detentChange.current = options?.onSelectionChange;
      return { detents, selection: options?.selection };
    },
    presentationDragIndicator: none,
    redacted: () => ({ redacted: true }),
    scrollContentBackground: none,
    accessibilityAddTraits: none,
    accessibilityElement: none,
    accessibilityHidden: none,
    accessibilityValue: none,
    buttonBorderShape: none,
    buttonStyle: none,
    listRowBackground: none,
    listRowInsets: none,
    listRowSeparator: none,
    padding: none,
    pickerStyle: none,
    tag: (value: string) => ({ tag: value }),
    tint: none,
  };
});
vi.mock('../src/ui/chat/session-model-filter-strip', () => ({
  FILTER_SKELETON_CHIPS: 5,
  ModelFilterGlyph: ({ brand, sub }: { brand?: string; sub: boolean }) =>
    createElement('b', { 'data-filter-brand': brand, 'data-sub': String(sub) }),
}));
vi.mock('@expo/ui/swift-ui', () => {
  const box =
    (tag: string) =>
    ({ children, modifiers }: { children?: ReactNode; modifiers?: Modifier[] }) =>
      createElement(
        tag,
        {
          'data-title': modifiers?.find((m) => m.title)?.title,
          'data-detents': modifiers?.find((m) => m.detents)?.detents?.join(),
          'data-detent': modifiers?.find((m) => m.detents)?.selection,
          'data-redacted': modifiers?.some((m) => m.redacted) ? 'true' : undefined,
        },
        children,
      );
  const Toolbar = box('div') as ReturnType<typeof box> & { Content: ReturnType<typeof box> };
  Toolbar.Content = box('nav');
  return {
    BottomSheet: ({ isPresented, children }: { isPresented: boolean; children: ReactNode }) =>
      isPresented ? createElement('div', { role: 'dialog' }, children) : null,
    Button: ({
      children,
      label,
      systemImage,
      role,
      onPress,
      modifiers,
    }: {
      children?: ReactNode;
      label?: string;
      systemImage?: string;
      role?: string;
      onPress(): void;
      modifiers?: Modifier[];
    }) =>
      createElement(
        'button',
        {
          onClick: onPress,
          'data-role': role,
          'data-label': label,
          'data-system-image': systemImage,
          'aria-label': modifiers?.find((m) => m.label)?.label ?? label,
          'data-redacted': modifiers?.some((m) => m.redacted) ? 'true' : undefined,
          disabled: modifiers?.some((m) => m.disabled) ?? false,
        },
        children ?? label,
      ),
    Group: box('section'),
    HStack: box('div'),
    Host: box('div'),
    Image: ({ systemName }: { systemName: string }) =>
      createElement('i', { 'data-symbol': systemName }),
    List: box('ul'),
    NavigationStack: box('div'),
    ProgressView: ({ modifiers }: { modifiers?: Modifier[] }) =>
      createElement('progress', { 'aria-label': modifiers?.find((m) => m.label)?.label }),
    RNHostView: ({ children }: { children: ReactNode }) => children,
    ScrollView: box('menu'),
    Picker: ({
      label,
      selection,
      onSelectionChange,
      children,
    }: {
      label: string;
      selection: string;
      onSelectionChange(value: string): void;
      children?: ReactNode;
    }) =>
      createElement(
        'select',
        {
          'aria-label': label,
          value: selection,
          onChange: (event: { target: { value: string } }) => onSelectionChange(event.target.value),
        },
        children,
      ),
    Section: ({ title, children }: { title?: string; children?: ReactNode }) =>
      createElement('fieldset', { 'data-heading': title }, children),
    Spacer: () => null,
    Text: ({ children, modifiers }: { children?: ReactNode; modifiers?: { tag?: string }[] }) => {
      const value = modifiers?.find((m) => m.tag !== undefined)?.tag;
      return value === undefined
        ? createElement('span', null, children)
        : createElement('option', { value }, children);
    },
    Toolbar,
    ToolbarItem: ({ placement, children }: { placement: string; children: ReactNode }) =>
      createElement('div', { 'data-placement': placement }, children),
    VStack: box('div'),
  };
});

const { NativeSessionModelSheet } = await import('../src/ui/chat/session-model-native.ios');
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const container = document.createElement('div');
const root = createRoot(container);
afterEach(() => act(() => root.render(null)));

const props = {
  visible: true,
  title: 'Model choice',
  closeLabel: 'Close',
  retryLabel: 'Retry',
  savingLabel: 'Saving',
  loading: false,
  refreshLabel: 'Refresh models',
  refreshingLabel: 'Refreshing models',
  refreshing: false,
  current: 'default',
  sections: [
    {
      id: 'default' as const,
      title: '',
      data: [{ key: 'default', name: 'Use Bot default', accessible: 'default' }],
    },
    {
      id: 'api' as const,
      title: 'API models',
      data: [
        {
          key: 'flash',
          name: 'V4.1 Flash',
          brand: 'deepseek' as const,
          detail: 'DeepSeek',
          tag: 'API',
          accessible: 'V4.1 Flash, API',
        },
        { key: 'resting', name: 'M3', disabled: true, accessible: 'M3' },
      ],
    },
  ],
  onClose: vi.fn(),
  onRetry: vi.fn(),
  skeleton: [
    { id: 'default' as const, title: '', rows: 1 },
    { id: 'subs' as const, title: 'Subscriptions', rows: 3 },
    { id: 'api' as const, title: 'API models', rows: 6 },
  ],
  filters: [
    {
      key: 'sub:claude',
      brand: 'claude' as const,
      source: 'sub' as const,
      title: 'Claude',
      accessible: 'Claude subscription',
    },
    {
      key: 'api:deepseek',
      brand: 'deepseek' as const,
      source: 'api' as const,
      title: 'DeepSeek',
      accessible: 'DeepSeek',
    },
  ],
  filter: undefined as string | undefined,
  filterLabel: 'Filter by provider',
  effortLabel: 'Reasoning effort',
  effort: undefined as
    | { key: string; current: string; options: { id: string; name: string }[] }
    | undefined,
  onRefresh: vi.fn(),
  onFilter: vi.fn(),
  onEffort: vi.fn(),
  onChoose: vi.fn(),
};

it('renders the model choice as a system List with a native close button and a checkmark', () => {
  act(() => root.render(createElement(NativeSessionModelSheet, props)));
  const close = container.querySelector('[data-placement="cancellationAction"] button');
  expect(close?.getAttribute('data-role')).toBe('close');
  expect(close?.getAttribute('aria-label')).toBe('Close');
  expect(container.querySelector('ul')?.getAttribute('data-title')).toBe('Model choice');
  expect(container.querySelector('section')?.getAttribute('data-detents')).toBe('medium,large');
  expect(container.querySelector('[data-heading="API models"]')).not.toBeNull();
  const row = container.querySelector('[aria-label="V4.1 Flash, API"]');
  expect(row?.querySelector('[data-brand="deepseek"]')).not.toBeNull();
  expect(
    container.querySelector('[aria-label="default"] [data-symbol="checkmark"]'),
  ).not.toBeNull();
  expect(container.querySelector<HTMLButtonElement>('[aria-label="M3"]')?.disabled).toBe(true);
  act(() => (row as HTMLButtonElement).click());
  expect(props.onChoose).toHaveBeenCalledWith('flash');
  act(() => (close as HTMLButtonElement).click());
  expect(props.onClose).toHaveBeenCalledOnce();
});

it('shows a plain xmark close button before iOS 26, where the close role does not exist', () => {
  os.version = '18.7';
  act(() => root.render(createElement(NativeSessionModelSheet, props)));
  const close = container.querySelector('[data-placement="cancellationAction"] button');
  expect(close?.getAttribute('data-role')).toBeNull();
  expect(close?.getAttribute('aria-label')).toBe('Close');
  expect(close?.querySelector('[data-symbol="xmark"]')).not.toBeNull();
  os.version = '26.0';
});

it('keeps the opening detent when the catalog arrives and keeps a detent the user dragged to', () => {
  act(() => root.render(createElement(NativeSessionModelSheet, { ...props, loading: true })));
  const detent = () => container.querySelector('section')?.getAttribute('data-detent');
  expect(detent()).toBe('medium');
  act(() => root.render(createElement(NativeSessionModelSheet, props)));
  expect(detent()).toBe('medium');
  act(() => detentChange.current?.('large'));
  act(() => root.render(createElement(NativeSessionModelSheet, { ...props, refreshing: true })));
  expect(detent()).toBe('large');
});

it('draws the skeleton with the loaded sections, headers and filter strip so rows do not shift', () => {
  act(() => root.render(createElement(NativeSessionModelSheet, { ...props, loading: true })));
  expect(container.querySelector('[aria-label="V4.1 Flash, API"]')).toBeNull();
  const fieldsets = () => [...container.querySelectorAll('fieldset')];
  expect(fieldsets().map((set) => set.getAttribute('data-heading'))).toEqual([
    null,
    null,
    'Subscriptions',
    'API models',
  ]);
  expect(
    fieldsets().map((set) => set.querySelectorAll('button[data-redacted="true"]').length),
  ).toEqual([1, 0, 3, 6]);
  expect(
    fieldsets()[1]!.querySelector('menu[data-redacted="true"]')?.children[0]?.children,
  ).toHaveLength(5);
  act(() => root.render(createElement(NativeSessionModelSheet, props)));
  expect(fieldsets().map((set) => set.getAttribute('data-heading'))).toEqual([
    null,
    null,
    'API models',
  ]);
});

it('shows a refresh button that becomes progress', () => {
  act(() => root.render(createElement(NativeSessionModelSheet, props)));
  const refresh = container.querySelector<HTMLButtonElement>(
    '[data-placement="primaryAction"] button',
  );
  expect(refresh?.getAttribute('aria-label')).toBe('Refresh models');
  expect(refresh?.getAttribute('data-system-image')).toBe('arrow.clockwise');
  expect(refresh?.getAttribute('data-label')).toBe('Refresh models');
  act(() => refresh?.click());
  expect(props.onRefresh).toHaveBeenCalledOnce();
  act(() => root.render(createElement(NativeSessionModelSheet, { ...props, refreshing: true })));
  expect(
    container
      .querySelector('[data-placement="primaryAction"] progress')
      ?.getAttribute('aria-label'),
  ).toBe('Refreshing models');
});

it('puts the provider strip under the Default row, badges subscriptions and toggles the filter', () => {
  act(() => root.render(createElement(NativeSessionModelSheet, props)));
  const sets = [...container.querySelectorAll('fieldset')];
  expect(sets[0]!.querySelector('[aria-label="default"]')).not.toBeNull();
  const claude = sets[1]!.querySelector<HTMLButtonElement>('[aria-label="Claude subscription"]');
  expect(claude?.querySelector('[data-filter-brand="claude"]')?.getAttribute('data-sub')).toBe(
    'true',
  );
  expect(
    sets[1]!.querySelector('[aria-label="DeepSeek"] [data-filter-brand]')?.getAttribute('data-sub'),
  ).toBe('false');
  act(() => claude?.click());
  expect(props.onFilter).toHaveBeenLastCalledWith('sub:claude');
  act(() =>
    root.render(createElement(NativeSessionModelSheet, { ...props, filter: 'sub:claude' })),
  );
  act(() =>
    container.querySelector<HTMLButtonElement>('[aria-label="Claude subscription"]')?.click(),
  );
  expect(props.onFilter).toHaveBeenLastCalledWith(undefined);
});

it('puts the reasoning effort menu right under the selected model with only its levels', () => {
  const effort = {
    key: 'flash',
    current: 'high',
    options: [
      { id: 'low', name: 'Low' },
      { id: 'high', name: 'High' },
    ],
  };
  act(() =>
    root.render(createElement(NativeSessionModelSheet, { ...props, current: 'flash', effort })),
  );
  const api = [...container.querySelectorAll('fieldset')].find(
    (set) => set.getAttribute('data-heading') === 'API models',
  )!;
  const children = [...api.children];
  const row = children.findIndex((child) => child.getAttribute('aria-label') === 'V4.1 Flash, API');
  const select = children[row + 1] as HTMLSelectElement;
  expect(select.tagName).toBe('SELECT');
  expect(select.getAttribute('aria-label')).toBe('Reasoning effort');
  expect([...select.options].map((option) => option.textContent)).toEqual(['Low', 'High']);
  act(() => {
    select.value = 'low';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(props.onEffort).toHaveBeenCalledWith('low');
  act(() => root.render(createElement(NativeSessionModelSheet, props)));
  expect(container.querySelector('select')).toBeNull();
});
