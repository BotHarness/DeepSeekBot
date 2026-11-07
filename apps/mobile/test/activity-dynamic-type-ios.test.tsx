// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const environment = vi.hoisted(() => ({ fontScale: 1, scheme: 'light' }));

vi.mock('react-native', () => ({ Platform: { OS: 'ios', Version: 27 } }));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({
    ...environment,
    touch: 44,
    color: { fg: 'foreground', accent: 'accent' },
  }),
}));
vi.mock('../src/ui/strings', () => ({
  useStrings: () => ({
    activityMore: 'More',
    activityOptions: 'Filter and sort',
    activitySearch: 'Search activity',
  }),
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityAddTraits: (traits: string[]) => ({ kind: 'traits', traits }),
  accessibilityIdentifier: (identifier: string) => ({ kind: 'identifier', identifier }),
  accessibilityLabel: (label: string) => ({ kind: 'label', label }),
  buttonStyle: () => ({}),
  dynamicTypeSize: (range: unknown) => ({ kind: 'dynamicTypeSize', range }),
  font: (value: unknown) => ({ kind: 'font', value }),
  foregroundStyle: () => ({}),
  frame: (value: unknown) => ({ kind: 'frame', value }),
  glassEffect: () => ({}),
  tint: () => ({}),
}));

type Modifier = { kind?: string; label?: string; identifier?: string };

vi.mock('@expo/ui/swift-ui', () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return {
    Host: ({ children }: { children: ReactNode }) => {
      const [measuredScale] = useState(environment.fontScale);
      return (
        <div data-native-host data-measured-scale={measuredScale}>
          {children}
        </div>
      );
    },
    HStack: Container,
    RNHostView: Container,
    ContextMenu: Object.assign(Container, { Trigger: Container, Items: Container }),
    Image: ({ systemName, modifiers }: { systemName: string; modifiers: Modifier[] }) => (
      <i data-symbol={systemName} data-modifiers={JSON.stringify(modifiers)} />
    ),
    Menu: ({ label, children }: { label: ReactNode; children: ReactNode }) => (
      <section>
        {label}
        {children}
      </section>
    ),
    Button: ({
      label,
      children,
      onPress,
      modifiers = [],
    }: {
      label?: string;
      children?: ReactNode;
      onPress(): void;
      modifiers?: Modifier[];
    }) => (
      <button
        aria-label={modifiers.find((modifier) => modifier.kind === 'label')?.label ?? label}
        data-modifiers={JSON.stringify(modifiers)}
        onClick={onPress}
      >
        {label}
        {children}
      </button>
    ),
  };
});

import { ContextMenuArea } from '../src/ui/primitives/context-menu.ios';
import { ActivityHeaderActions } from '../src/ui/shell/activity-header-actions.ios';
import type { ActivityOptions } from '../src/ui/shell/activity-header-actions';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let container: HTMLDivElement;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  environment.fontScale = 1;
  environment.scheme = 'light';
});

async function render(children: ReactNode) {
  if (!root) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }
  await act(async () => root!.render(children));
}

it('remeasures native context-menu rows on live size changes, not ordinary updates', async () => {
  const run = vi.fn();
  const row = () => (
    <ContextMenuArea actions={[{ key: 'inspect', label: 'Inspect', run }]}>
      <span>Unread conversation</span>
    </ContextMenuArea>
  );
  await render(row());
  const initialHost = container.querySelector('[data-native-host]');
  expect(initialHost?.getAttribute('data-measured-scale')).toBe('1');
  for (let update = 0; update < 20; update += 1) {
    await render(row());
    expect(container.querySelector('[data-native-host]')).toBe(initialHost);
  }

  for (const fontScale of [2, 3.571, 1]) {
    environment.fontScale = fontScale;
    await render(row());
    expect(container.querySelector('[data-native-host]')?.getAttribute('data-measured-scale')).toBe(
      String(fontScale),
    );
    expect(container.textContent).toContain('Unread conversation');
  }

  await act(async () => container.querySelector('button')!.click());
  expect(run).toHaveBeenCalledOnce();
});

it('keeps rows without menu actions outside a native measuring host', async () => {
  await render(
    <ContextMenuArea actions={[]}>
      <span>Live content</span>
    </ContextMenuArea>,
  );
  expect(container.textContent).toBe('Live content');
  expect(container.querySelector('[data-native-host]')).toBeNull();
});

it('bounds only Activity action symbols while retaining native menu labels and callbacks', async () => {
  environment.fontScale = 3.571;
  const onFilter = vi.fn();
  const onSearch = vi.fn();
  const run = vi.fn();
  const options: ActivityOptions = {
    bots: [],
    channels: [],
    filter: { section: 'all', bot: undefined },
    sort: 'default',
    onFilter: vi.fn(),
    onSort: vi.fn(),
  };
  await render(
    <ActivityHeaderActions
      filtered={false}
      searching={false}
      onFilter={onFilter}
      onSearch={onSearch}
      options={options}
      manage={{ items: [{ key: 'read', label: 'Mark all as read', icon: 'read' }], run }}
    />,
  );
  const symbols = [...container.querySelectorAll('[data-symbol]')];
  expect(symbols.map((symbol) => symbol.getAttribute('data-symbol'))).toEqual([
    'ellipsis',
    'line.3.horizontal.decrease',
    'magnifyingglass',
  ]);
  for (const symbol of symbols) {
    const modifiers = JSON.parse(symbol.getAttribute('data-modifiers')!);
    expect(modifiers).toContainEqual({ kind: 'dynamicTypeSize', range: { max: 'xxxLarge' } });
    expect(modifiers).toContainEqual({ kind: 'frame', value: { width: 44, height: 44 } });
  }
  const buttons = [...container.querySelectorAll('button')];
  for (const button of buttons) {
    expect(JSON.parse(button.getAttribute('data-modifiers')!)).not.toContainEqual(
      expect.objectContaining({ kind: 'dynamicTypeSize' }),
    );
    await act(async () => button.click());
  }
  expect(run).toHaveBeenCalledWith('read');
  expect(onFilter).toHaveBeenCalledOnce();
  expect(onSearch).toHaveBeenCalledOnce();
});
