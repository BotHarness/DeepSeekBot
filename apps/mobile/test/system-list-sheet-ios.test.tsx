// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

type Modifier = {
  label?: string;
  title?: string;
  detents?: string[];
  selected?: boolean;
  disabled?: boolean;
  style?: string;
  ink?: string;
};

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', Version: '26.1' },
  PlatformColor: (name: string) => name,
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ scheme: 'dark', color: { accent: 'blue' } }),
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => {
  const none = () => ({});
  return {
    accessibilityAddTraits: (traits: string[]) => ({ selected: traits.includes('isSelected') }),
    accessibilityLabel: (label: string) => ({ label }),
    buttonStyle: (style: string) => ({ style }),
    disabled: (value: boolean) => ({ disabled: value }),
    font: none,
    foregroundStyle: (ink: string) => ({ ink }),
    frame: none,
    listStyle: none,
    navigationBarTitleDisplayMode: none,
    navigationTitle: (title: string) => ({ title }),
    presentationDetents: (detents: string[]) => ({ detents }),
    presentationDragIndicator: none,
    scrollContentBackground: none,
    tint: none,
  };
});
const dismiss: { current?: () => void } = {};
vi.mock('@expo/ui/swift-ui', () => {
  const box =
    (tag: string) =>
    ({ children, modifiers }: { children?: ReactNode; modifiers?: Modifier[] }) =>
      createElement(
        tag,
        {
          'data-title': modifiers?.find((m) => m.title)?.title,
          'data-detents': modifiers?.find((m) => m.detents)?.detents?.join(),
        },
        children,
      );
  const Toolbar = box('div') as ReturnType<typeof box> & { Content: ReturnType<typeof box> };
  Toolbar.Content = box('nav');
  return {
    BottomSheet: ({
      isPresented,
      onDismiss,
      children,
    }: {
      isPresented: boolean;
      onDismiss(): void;
      children: ReactNode;
    }) => {
      dismiss.current = onDismiss;
      return createElement('dialog', { 'data-open': String(isPresented) }, children);
    },
    Button: ({
      children,
      label,
      role,
      systemImage,
      onPress,
      modifiers,
    }: {
      children?: ReactNode;
      label?: string;
      role?: string;
      systemImage?: string;
      onPress(): void;
      modifiers?: Modifier[];
    }) =>
      createElement(
        'button',
        {
          onClick: onPress,
          'data-role': role,
          'data-symbol': systemImage,
          'data-style': modifiers?.find((m) => m.style)?.style,
          'data-selected': modifiers?.some((m) => m.selected) ? 'true' : undefined,
          'aria-label': modifiers?.find((m) => m.label)?.label ?? label,
          disabled: modifiers?.some((m) => m.disabled) ?? false,
        },
        children ?? label,
      ),
    Group: box('section'),
    HStack: box('div'),
    VStack: box('div'),
    Host: box('div'),
    Image: ({ systemName }: { systemName: string }) =>
      createElement('i', { 'data-symbol': systemName }),
    List: box('ul'),
    NavigationStack: box('div'),
    ProgressView: () => createElement('progress'),
    RNHostView: ({ children }: { children: ReactNode }) => children,
    Section: ({
      title,
      footer,
      children,
    }: {
      title?: string;
      footer?: ReactNode;
      children?: ReactNode;
    }) => createElement('fieldset', { 'data-heading': title }, children, footer),
    Spacer: () => null,
    Text: ({ children, modifiers }: { children?: ReactNode; modifiers?: Modifier[] }) =>
      createElement('span', { 'data-ink': modifiers?.find((m) => m.ink)?.ink }, children),
    Toggle: ({ label, isOn }: { label: string; isOn: boolean }) =>
      createElement('input', {
        type: 'checkbox',
        'aria-label': label,
        checked: isOn,
        readOnly: true,
      }),
    Toolbar,
    ToolbarItem: ({ placement, children }: { placement: string; children: ReactNode }) =>
      createElement('div', { 'data-placement': placement }, children),
  };
});

const { SystemListSheet } = await import('../src/ui/primitives/system-list-sheet.ios');
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const container = document.createElement('div');
const root = createRoot(container);
afterEach(() => act(() => root.render(null)));

const choose = vi.fn();
const confirm = vi.fn();
const close = vi.fn();
const props = {
  visible: true,
  title: 'Invite',
  closeLabel: 'Close',
  confirm: { label: 'Done', onPress: confirm },
  onClose: close,
  sections: [
    {
      key: 'bots',
      title: 'Bots',
      footer: 'Pick one',
      rows: [
        { kind: 'choice' as const, key: 'ada', label: 'Ada', selected: true, onPress: choose },
        { kind: 'choice' as const, key: 'bob', label: 'Bob', busy: true, onPress: choose },
        {
          kind: 'choice' as const,
          key: 'gone',
          label: 'Delete',
          destructive: true,
          onPress: choose,
        },
        { kind: 'choice' as const, key: 'off', label: 'Off', disabled: true, onPress: choose },
        {
          kind: 'choice' as const,
          key: 'add',
          label: 'Eve',
          accessory: 'add' as const,
          onPress: choose,
        },
      ],
    },
    {
      key: 'more',
      rows: [
        { kind: 'toggle' as const, key: 'unread', label: 'Unread', value: true, onChange: vi.fn() },
        { kind: 'note' as const, key: 'oops', text: 'Failed', tone: 'danger' as const },
        { kind: 'action' as const, key: 'reset', label: 'Reset', onPress: vi.fn() },
      ],
    },
  ],
};

it('renders sections as a system List with the native close and confirm buttons', () => {
  act(() => root.render(createElement(SystemListSheet, props)));
  expect(container.querySelector('ul')?.getAttribute('data-title')).toBe('Invite');
  expect(container.querySelector('section')?.getAttribute('data-detents')).toBe('medium,large');
  const closeButton = container.querySelector('[data-placement="cancellationAction"] button');
  expect(closeButton?.getAttribute('data-role')).toBe('close');
  const done = container.querySelector('[data-placement="confirmationAction"] button');
  expect(done?.getAttribute('data-symbol')).toBe('checkmark');
  expect(done?.getAttribute('data-style')).toBe('glassProminent');
  expect(container.querySelector('[data-heading="Bots"]')?.textContent).toContain('Pick one');
  const ada = container.querySelector('[aria-label="Ada"]');
  expect(ada?.getAttribute('data-selected')).toBe('true');
  expect(ada?.querySelector('[data-symbol="checkmark"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Bob"] progress')).not.toBeNull();
  expect(container.querySelector('[aria-label="Delete"] span')?.getAttribute('data-ink')).toBe(
    'systemRed',
  );
  expect(container.querySelector('[aria-label="Ada"] span')?.getAttribute('data-ink')).toBe(
    'label',
  );
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Off"]')?.disabled).toBe(true);
  expect(container.querySelector('[aria-label="Eve"] [data-symbol="plus"]')).not.toBeNull();
  expect(container.querySelector<HTMLInputElement>('[aria-label="Unread"]')?.checked).toBe(true);
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="Ada"]')!.click());
  expect(choose).toHaveBeenCalledOnce();
  act(() => (done as HTMLButtonElement).click());
  expect(confirm).toHaveBeenCalledOnce();
  act(() => (closeButton as HTMLButtonElement).click());
  expect(close).toHaveBeenCalledOnce();
});

it('presents again when the caller refuses a swipe-down, and reports a real dismissal', () => {
  const dismissed = vi.fn();
  act(() => root.render(createElement(SystemListSheet, { ...props, onDismissed: dismissed })));
  act(() => dismiss.current?.());
  expect(dismissed).not.toHaveBeenCalled();
  expect(container.querySelector('dialog')?.getAttribute('data-open')).toBe('true');
  act(() =>
    root.render(
      createElement(SystemListSheet, { ...props, visible: false, onDismissed: dismissed }),
    ),
  );
  act(() => dismiss.current?.());
  expect(dismissed).toHaveBeenCalledOnce();
  expect(container.querySelector('dialog')).toBeNull();
});
