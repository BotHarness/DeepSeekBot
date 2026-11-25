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
};

const detentChange = vi.hoisted(() => ({
  current: undefined as ((d: string) => void) | undefined,
}));

const os = vi.hoisted(() => ({ version: '26.0' }));
vi.mock('react-native', () => ({
  Platform: {
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
    redacted: none,
    scrollContentBackground: none,
  };
});
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
      role,
      onPress,
      modifiers,
    }: {
      children?: ReactNode;
      label?: string;
      role?: string;
      onPress(): void;
      modifiers?: Modifier[];
    }) =>
      createElement(
        'button',
        {
          onClick: onPress,
          'data-role': role,
          'aria-label': modifiers?.find((m) => m.label)?.label ?? label,
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
    Section: ({ title, children }: { title?: string; children?: ReactNode }) =>
      createElement('fieldset', { 'data-heading': title }, children),
    Spacer: () => null,
    Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
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
    { title: '', data: [{ key: 'default', name: 'Use Bot default', accessible: 'default' }] },
    {
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
  onRefresh: vi.fn(),
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

it('shows skeleton rows while loading and a refresh button that becomes progress', () => {
  act(() => root.render(createElement(NativeSessionModelSheet, { ...props, loading: true })));
  expect(container.querySelector('[aria-label="V4.1 Flash, API"]')).toBeNull();
  expect(container.querySelectorAll('[data-symbol="circle.fill"]')).toHaveLength(8);
  act(() => root.render(createElement(NativeSessionModelSheet, props)));
  const refresh = container.querySelector<HTMLButtonElement>(
    '[data-placement="primaryAction"] button',
  );
  expect(refresh?.getAttribute('aria-label')).toBe('Refresh models');
  act(() => refresh?.click());
  expect(props.onRefresh).toHaveBeenCalledOnce();
  act(() => root.render(createElement(NativeSessionModelSheet, { ...props, refreshing: true })));
  expect(
    container
      .querySelector('[data-placement="primaryAction"] progress')
      ?.getAttribute('aria-label'),
  ).toBe('Refreshing models');
});
