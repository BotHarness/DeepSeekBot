// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { editCreationTags, type CreationTagDraft } from '../src/host/bot-creation-tags';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const native = vi.hoisted(() => ({
  change: undefined as undefined | ((text: string) => void),
  enter: undefined as undefined | ((text: string) => void),
}));
vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@expo/ui', () => ({
  Host: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@expo/ui/jetpack-compose', () => {
  const Slot = ({ children }: { children?: ReactNode }) => <span>{children}</span>;
  const Chip = Object.assign(
    ({
      enabled,
      onClick,
      children,
    }: {
      enabled: boolean;
      onClick(): void;
      children: ReactNode;
    }) => (
      <button disabled={!enabled} onClick={onClick}>
        {children}
      </button>
    ),
    { Label: Slot, TrailingIcon: Slot },
  );
  return { FlowRow: Slot, Text: Slot, Icon: () => <span>×</span>, InputChip: Chip };
});
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  defaultMinSize: () => ({}),
  fillMaxWidth: () => ({}),
  semantics: () => ({}),
  testID: () => ({}),
}));
vi.mock('../src/ui/primitives/text', () => ({
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock('../src/ui/primitives/creation-field', () => ({
  CreationField: ({
    value,
    onChangeText,
    onSubmitValue,
    editable,
  }: {
    value: string;
    onChangeText(text: string): void;
    onSubmitValue(text: string): void;
    editable: boolean;
  }) => {
    native.change = onChangeText;
    native.enter = onSubmitValue;
    return <input value={value} readOnly disabled={!editable} />;
  },
}));
vi.mock('../src/ui/design/theme', async () => {
  const { resolveTheme } = await import('../src/ui/design/resolve-theme');
  return { useDesignTheme: () => resolveTheme('dark', {}, 'android') };
});
vi.mock('../src/ui/strings', () => ({
  useStrings: () => ({
    botCreation: {
      tagInput: 'Add tag',
      tagInputHint: 'Press Enter to add a tag',
      removeTag: (tag: string) => `Remove ${tag}`,
    },
  }),
}));
import { CreationTagsField } from '../src/ui/primitives/creation-tags-field.android';
import { CreationTagsField as ExistingTagsField } from '../src/ui/primitives/creation-tags-field';

let root: Root;
let view: HTMLDivElement;
let current: CreationTagDraft;
async function mount(tags: string, disabled = false, android = true) {
  view = document.createElement('div');
  document.body.append(view);
  root = createRoot(view);
  function Harness() {
    const [draft, setDraft] = useState<CreationTagDraft>({ tags });
    current = draft;
    const Field = android ? CreationTagsField : ExistingTagsField;
    return (
      <Field
        value={draft}
        disabled={disabled}
        onChange={(action) => setDraft((value) => editCreationTags(value, action))}
      />
    );
  }
  await act(() => root.render(<Harness />));
}
afterEach(async () => {
  await act(() => root?.unmount());
  view?.remove();
});

it('renders imported tags, adds on Enter and removes chips without remounting the input', async () => {
  await mount('Imported');
  const input = view.querySelector('input');
  expect(view.querySelector('button')?.textContent).toBe('Imported×');
  await act(() => native.enter?.('中文\n'));
  expect([...view.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
    'Imported×',
    '中文×',
  ]);
  await act(() => native.change?.('Pending'));
  await act(() => view.querySelector('button')!.click());
  expect(current).toEqual({ tags: '中文', tagInput: 'Pending' });
  expect(view.querySelector('input')).toBe(input);
  expect(view.querySelector('input')?.value).toBe('Pending');
});
it('keeps the original input mounted when adding the first or removing the last chip', async () => {
  await mount('');
  const input = view.querySelector('input');
  await act(() => native.enter?.('First\n'));
  await act(() => native.enter?.('First\n'));
  expect(view.querySelectorAll('button')).toHaveLength(1);
  expect(view.querySelector('input')).toBe(input);
  await act(() => view.querySelector('button')!.click());
  expect(view.querySelectorAll('button')).toHaveLength(0);
  expect(view.querySelector('input')).toBe(input);
});
it('prevents tag mutations while creation is busy', async () => {
  await mount('Existing', true);
  await act(() => {
    native.change?.('New');
    native.enter?.('New\n');
    view.querySelector('button')!.click();
  });
  expect(current).toEqual({ tags: 'Existing' });
});

it('keeps the existing non-Android tags field editing its original value', async () => {
  await mount('Existing', false, false);
  await act(() => native.change?.('Existing, Added'));
  expect(current).toEqual({ tags: 'Existing, Added' });
  expect(view.querySelector('input')?.value).toBe('Existing, Added');
});
