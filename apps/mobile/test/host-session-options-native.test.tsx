// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import type { SystemListSheetProps } from '../src/ui/primitives/system-list-sheet';

const sheet = vi.hoisted(() => ({ props: undefined as SystemListSheetProps | undefined }));

vi.mock('react-native', () => ({ FlatList: () => null, Pressable: () => null }));
vi.mock('../src/ui/chat/sheet', () => ({
  Sheet: () => {
    throw new Error('native platforms present options in the system list sheet');
  },
}));
vi.mock('../src/ui/design/theme', () => ({ useDesignTheme: () => ({}) }));
vi.mock('../src/ui/strings', () => {
  const strings = { close: 'Close', hostSessions: { options: 'Options' } };
  return { useStrings: () => strings };
});
vi.mock('../src/ui/primitives/radio-mark', () => ({ RadioMark: () => null }));
vi.mock('../src/ui/primitives/text', () => ({ Text: () => null }));
vi.mock('../src/ui/primitives/system-list-sheet', () => ({
  SystemListSheet: (props: SystemListSheetProps) => {
    sheet.props = props;
    return null;
  },
}));

const { HostSessionOptionsSheet } = await import('../src/ui/shell/host-session-options');

it('presents session options as titled system list sections with the choice checked', async () => {
  const pick = vi.fn();
  const root = createRoot(document.createElement('div'));
  const render = (open: boolean) =>
    root.render(
      <HostSessionOptionsSheet
        open={open}
        onClose={() => {}}
        groups={[
          {
            id: 'sort',
            label: 'Sort',
            selected: 'recent',
            choices: [
              { id: 'recent', label: 'Recent', select: () => {} },
              { id: 'name', label: 'Name', select: pick },
            ],
          },
        ]}
      />,
    );
  await act(async () => render(true));
  expect(sheet.props?.visible).toBe(true);
  expect(
    sheet.props?.sections.map((section) => [
      section.title,
      section.rows.map((row) => (row.kind === 'choice' ? [row.testID, row.selected] : row.kind)),
    ]),
  ).toEqual([
    [
      'Sort',
      [
        ['host-sessions-sort-recent', true],
        ['host-sessions-sort-name', false],
      ],
    ],
  ]);
  const name = sheet.props?.sections[0]?.rows[1];
  if (name?.kind === 'choice') name.onPress();
  expect(pick).toHaveBeenCalledOnce();
  await act(async () => render(false));
  expect(sheet.props?.visible).toBe(false);
  await act(async () => root.unmount());
});
