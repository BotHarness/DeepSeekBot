// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

type Press = { onPress?: () => void; accessibilityLabel?: string; children?: ReactNode };
type ListProps = {
  data: unknown[];
  keyExtractor(item: unknown): string;
  renderItem(info: { item: unknown }): ReactNode;
  ListHeaderComponent?: ReactNode;
  ListFooterComponent?: ReactNode;
};

vi.mock('react-native', () => {
  const View = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Platform: { OS: 'ios', Version: '18.7' },
    View,
    Modal: ({
      children,
      visible,
      presentationStyle,
    }: {
      children?: ReactNode;
      visible: boolean;
      presentationStyle?: string;
    }) => (visible ? <dialog data-presentation={presentationStyle}>{children}</dialog> : null),
    Pressable: ({ onPress, accessibilityLabel, children }: Press) => (
      <button aria-label={accessibilityLabel} onClick={onPress}>
        {typeof children === 'function' ? null : children}
      </button>
    ),
    FlatList: ({
      data,
      keyExtractor,
      renderItem,
      ListHeaderComponent,
      ListFooterComponent,
    }: ListProps) => (
      <div>
        {ListHeaderComponent}
        {data.map((item) => (
          <div key={keyExtractor(item)}>{renderItem({ item })}</div>
        ))}
        {ListFooterComponent}
      </div>
    ),
  };
});
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
vi.mock('@botharness/host-client/inbox', () => ({ INBOX_SECTIONS: ['unread', 'replies'] }));
vi.mock('../src/ui/chat/sheet', () => ({
  Sheet: () => {
    throw new Error('iOS presents Activity options as a page sheet');
  },
}));
vi.mock('../src/ui/design/theme', () => {
  const layer = { fill: 'fill', pressed: 'pressed', selected: 'selected', divider: 'divider' };
  return {
    useDesignTheme: () => ({
      touch: 44,
      overlay: layer,
      layer: { canvas: layer, raised: layer, sheet: layer },
    }),
  };
});
vi.mock('../src/ui/strings', () => {
  const strings = new Proxy(
    { inboxSections: { replies: 'Replies' }, activitySetAside: {} },
    {
      get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)),
    },
  );
  return { t: strings, useStrings: () => strings };
});
vi.mock('../src/ui/primitives/drawer-header', () => ({
  DrawerHeader: ({ title, onClose }: { title: string; onClose(): void }) => (
    <header>
      {title}
      <button aria-label="close" onClick={onClose} />
    </header>
  ),
}));
vi.mock('../src/ui/primitives/checkmark-row', () => ({
  CheckmarkRow: ({ label, onPress }: { label: string; onPress(): void }) => (
    <button aria-label={label} onClick={onPress} />
  ),
}));
vi.mock('../src/ui/primitives/text', () => ({
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock('../src/ui/primitives/toggle', () => ({ Toggle: () => null }));
vi.mock('../src/ui/primitives/radio-mark', () => ({ RadioMark: () => null }));

import {
  ActivityFilters,
  DEFAULT_ACTIVITY,
  type ActivityFilter,
  type ActivitySort,
} from '../src/ui/shell/activity-filters';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('opens and closes iOS Activity options 20 times through a React Native page sheet', async () => {
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
  const press = (label: string) =>
    act(async () => {
      const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      expect(button).not.toBeNull();
      button!.click();
    });
  try {
    await act(async () => root.render(createElement(Activity)));
    for (let round = 0; round < 20; round++) {
      await press('activity-filter-button');
      expect(container.querySelector('dialog')?.dataset.presentation).toBe('pageSheet');
      expect(container.querySelector('header')?.textContent).toBe('activityOptions');
      await press('close');
      expect(container.querySelector('dialog')).toBeNull();
    }
    await press('activity-filter-button');
    await press('activityReset');
    expect(seen.at(-1)).toEqual({ filter: DEFAULT_ACTIVITY, sort: 'default' });
  } finally {
    await act(async () => root.unmount());
  }
});

it('keeps UIKit navigation bars out of native modules, which iOS 18 asserts on inside sheets', () => {
  const modules = join(import.meta.dirname, '..', 'modules');
  const swift = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return swift(path);
      return name.endsWith('.swift') ? [path] : [];
    });
  const offenders = swift(modules).filter((path) =>
    /\b(NavigationStack|NavigationView|NavigationSplitView)\b/.test(readFileSync(path, 'utf8')),
  );
  expect(offenders).toEqual([]);
});
