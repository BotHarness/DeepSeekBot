// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

type Modifier = {
  label?: string;
  title?: string;
  detents?: string[];
  selected?: boolean;
  disabled?: boolean;
};

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', Version: '18.7' },
  PlatformColor: (name: string) => name,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Pressable: () => null,
  FlatList: () => null,
}));
vi.mock('@botharness/host-client/inbox', () => ({ INBOX_SECTIONS: ['unread', 'replies'] }));
vi.mock('../src/ui/chat/sheet', () => ({
  SHEET_GROUP: 'raised',
  Sheet: () => {
    throw new Error('iOS presents Activity options as a SwiftUI sheet');
  },
}));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ scheme: 'light', color: { accent: 'blue' } }),
}));
vi.mock('../src/ui/strings', () => {
  const strings = new Proxy(
    { inboxSections: { replies: 'Replies' }, activitySetAside: {} },
    {
      get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)),
    },
  );
  return { t: strings, useStrings: () => strings };
});
vi.mock('../src/ui/primitives/sheet-header', () => ({ SheetHeader: () => null }));
vi.mock('../src/ui/primitives/text', () => ({ Text: () => null }));
vi.mock('../src/ui/primitives/toggle', () => ({ Toggle: () => null }));
vi.mock('../src/ui/primitives/radio-mark', () => ({ RadioMark: () => null }));
vi.mock('../src/ui/primitives/system-list-sheet', async () => ({
  ...(await import('../src/ui/primitives/system-list-sheet.ios')),
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => {
  const none = () => ({});
  return {
    accessibilityAddTraits: (traits: string[]) => ({ selected: traits.includes('isSelected') }),
    accessibilityLabel: (label: string) => ({ label }),
    buttonStyle: none,
    disabled: (value: boolean) => ({ disabled: value }),
    font: none,
    foregroundStyle: none,
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
    BottomSheet: ({ isPresented, children }: { isPresented: boolean; children: ReactNode }) =>
      isPresented ? createElement('dialog', null, children) : null,
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
          'data-selected': modifiers?.some((m) => m.selected) ? 'true' : undefined,
          'aria-label': modifiers?.find((m) => m.label)?.label ?? label,
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
    Section: ({ title, children }: { title?: string; children?: ReactNode }) =>
      createElement('fieldset', { 'data-heading': title }, children),
    Spacer: () => null,
    Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
    Toggle: ({
      label,
      isOn,
      onIsOnChange,
    }: {
      label: string;
      isOn: boolean;
      onIsOnChange(value: boolean): void;
    }) =>
      createElement('input', {
        type: 'checkbox',
        'aria-label': label,
        checked: isOn,
        onChange: () => onIsOnChange(!isOn),
      }),
    VStack: box('div'),
    Toolbar,
    ToolbarItem: ({ placement, children }: { placement: string; children: ReactNode }) =>
      createElement('div', { 'data-placement': placement }, children),
  };
});

import {
  ActivityFilters,
  DEFAULT_ACTIVITY,
  type ActivityFilter,
  type ActivitySort,
} from '../src/ui/shell/activity-filters';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('opens and closes iOS Activity options 20 times as a SwiftUI List sheet', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const seen: Array<{ filter: ActivityFilter; sort: ActivitySort }> = [];
  function Activity() {
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState<ActivityFilter>({ section: 'replies', bot: 'ada' });
    const [sort, setSort] = useState<ActivitySort>('newest');
    seen.push({ filter, sort });
    return (
      <>
        <button aria-label="activity-filter-button" onClick={() => setOpen(true)} />
        <ActivityFilters
          visible={open}
          bots={[{ slug: 'ada', name: 'Ada' }]}
          channels={[]}
          filter={filter}
          sort={sort}
          onFilter={setFilter}
          onSort={setSort}
          onClose={() => setOpen(false)}
        />
      </>
    );
  }
  const find = (label: string) => container.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  const press = (label: string) =>
    act(async () => {
      expect(find(label)).not.toBeNull();
      find(label)!.click();
    });
  try {
    await act(async () => root.render(createElement(Activity)));
    for (let round = 0; round < 20; round++) {
      await press('activity-filter-button');
      expect(container.querySelector('ul')?.getAttribute('data-title')).toBe('activityOptions');
      expect(container.querySelector('section')?.getAttribute('data-detents')).toBe('medium,large');
      const close = container.querySelector('[data-placement="cancellationAction"] button');
      expect(close?.getAttribute('data-role')).toBeNull();
      await press('close');
      expect(container.querySelector('dialog')).toBeNull();
    }
    await press('activity-filter-button');
    expect(
      [...container.querySelectorAll('fieldset')].map((f) => f.getAttribute('data-heading')),
    ).toEqual(['activitySort', 'activityCategory', null, 'activityFrom', 'bots', 'channels', null]);
    expect(find('Ada')?.dataset.selected).toBe('true');
    expect(find('Ada')?.querySelector('[data-symbol="checkmark"]')).not.toBeNull();
    await press('activitySortOldest');
    expect(seen.at(-1)?.sort).toBe('oldest');
    await press('activityUnreadOnly');
    expect(seen.at(-1)?.filter.unreadOnly).toBe(true);
    const reset = [...container.querySelectorAll('fieldset')].at(-1)?.querySelector('button');
    expect(reset?.getAttribute('aria-label')).toBe('activityReset');
    await press('activityReset');
    expect(seen.at(-1)).toEqual({ filter: DEFAULT_ACTIVITY, sort: 'default' });
  } finally {
    await act(async () => root.unmount());
  }
});

it('keeps SwiftUI inspectors out of native modules, whose navigation bar iOS 18 asserts on as a sheet', () => {
  const modules = join(import.meta.dirname, '..', 'modules');
  const swift = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return swift(path);
      return name.endsWith('.swift') ? [path] : [];
    });
  const offenders = swift(modules).filter((path) =>
    /\.inspector\s*\(/.test(readFileSync(path, 'utf8')),
  );
  expect(offenders).toEqual([]);
});
