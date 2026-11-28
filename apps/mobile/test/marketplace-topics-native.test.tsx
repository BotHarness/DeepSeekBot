// @vitest-environment jsdom
import { act, type ReactNode, type Ref } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import type { SystemListSheetProps } from '../src/ui/primitives/system-list-sheet';

const sheet = vi.hoisted(() => ({ props: undefined as SystemListSheetProps | undefined }));

vi.mock('react-native', () => ({
  View: ({ children, ref }: { children?: ReactNode; ref?: Ref<HTMLDivElement> }) => (
    <div ref={ref}>{children}</div>
  ),
  FlatList: () => null,
}));
vi.mock('../src/marketplace/native-catalogue', () => ({
  marketplace: {},
  useCatalogueResource: (resource: { getSnapshot(): unknown }) => resource.getSnapshot(),
}));
vi.mock('../src/ui/chat/sheet', () => ({
  SHEET_GROUP: 'raised',
  Sheet: () => {
    throw new Error('native platforms present topics in the system list sheet');
  },
  SheetActions: () => null,
  SheetNote: () => null,
}));
vi.mock('../src/ui/strings', () => {
  const strings = { close: 'Close', marketplace: { allTopics: 'All', topics: 'Topics' } };
  return { useStrings: () => strings };
});
vi.mock('../src/ui/primitives/button', () => ({ Button: () => null }));
vi.mock('../src/ui/primitives/checkmark-row', () => ({ CheckmarkRow: () => null }));
vi.mock('../src/ui/primitives/loading-indicator', () => ({ LoadingIndicator: () => null }));
vi.mock('../src/ui/primitives/settings-row', () => ({ SettingsGroupItem: () => null }));
vi.mock('../src/ui/primitives/system-list-sheet', () => ({
  SystemListSheet: (props: SystemListSheetProps) => {
    sheet.props = props;
    return null;
  },
}));

const { MarketplaceTopics } = await import('../src/ui/shell/marketplace-topics');

it('presents topics as system list choices without painting the sheet (#5682)', async () => {
  const refresh = vi.fn(async () => {});
  const snapshot = {
    status: 'ready' as const,
    busy: false,
    value: [{ topic: 'writing', count: 12 }],
  };
  const resource = { getSnapshot: () => snapshot, subscribe: () => () => {}, refresh };
  const onChange = vi.fn();
  const root = createRoot(document.createElement('div'));
  await act(async () =>
    root.render(
      <MarketplaceTopics
        visible
        value="writing"
        resource={resource}
        onChange={onChange}
        onClose={() => {}}
      />,
    ),
  );
  expect(refresh).toHaveBeenCalledOnce();
  expect(sheet.props?.title).toBe('Topics');
  const rows = sheet.props?.sections.flatMap((section) => section.rows) ?? [];
  expect(
    rows.map((row) =>
      row.kind === 'choice' ? [row.testID, row.label, row.selected] : [row.kind, row.key],
    ),
  ).toEqual([
    ['marketplace-topic-all', 'All', false],
    ['marketplace-topic-writing', 'writing (12)', true],
  ]);
  const all = rows[0];
  if (all?.kind === 'choice') all.onPress();
  expect(onChange).toHaveBeenCalledWith('');
  await act(async () => root.unmount());
});
