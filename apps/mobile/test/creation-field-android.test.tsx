// @vitest-environment jsdom
import { act, createElement, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));
const native = vi.hoisted(() => ({
  buffer: '',
  writes: [] as string[],
  change: undefined as undefined | ((text: string) => void),
  mounts: 0,
}));
vi.mock('@expo/ui/jetpack-compose', () => {
  const Slot = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
  const Field = Object.assign(
    ({
      onValueChange,
      children,
    }: {
      onValueChange?: (value: string) => void;
      children?: ReactNode;
    }) => {
      native.change = onValueChange;
      return createElement('div', { 'data-field': true }, children);
    },
    { Label: Slot, Placeholder: Slot, SupportingText: Slot },
  );
  return {
    Column: Slot,
    Host: Slot,
    Text: Slot,
    TextField: Field,
    useNativeState: (initial: string) => {
      const ref = useRef<{ get(): string; set(text: string): void } | null>(null);
      if (!ref.current) {
        native.buffer = initial;
        native.mounts++;
        ref.current = {
          get: () => native.buffer,
          set: (text) => {
            native.writes.push(text);
            native.buffer = text;
          },
        };
      }
      return ref.current;
    },
  };
});
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  fillMaxWidth: () => ({}),
  semantics: () => ({}),
  testID: () => ({}),
}));
vi.mock('../src/ui/design/theme', async () => {
  const { resolveTheme } = await import('../src/ui/design/resolve-theme');
  return { useDesignTheme: () => resolveTheme('dark', {}, 'android') };
});
import { CreationField } from '../src/ui/primitives/creation-field.android';
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  native.buffer = '';
  native.writes = [];
  native.mounts = 0;
  native.change = undefined;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
});
async function render(
  value: string,
  onChangeText = (text: string) => {
    void text;
  },
) {
  await act(() =>
    root.render(
      <CreationField value={value} onChangeText={onChangeText} accessibilityLabel="Name" />,
    ),
  );
}
function type(value: string) {
  native.buffer = value;
  native.change?.(value);
}
it('keeps newer native text when older draft echoes arrive during fast or composing input', async () => {
  const changed = vi.fn();
  await render('', changed);
  await act(() => {
    type('n');
    type('ni');
    type('你');
  });
  expect(changed.mock.calls.map((call) => call[0])).toEqual(['n', 'ni', '你']);
  await render('n', changed);
  expect(native.buffer).toBe('你');
  await render('ni', changed);
  expect(native.buffer).toBe('你');
  await render('你', changed);
  expect(native.buffer).toBe('你');
  expect(native.writes).toEqual([]);
  expect(native.mounts).toBe(1);
});
it('applies restored or prefilled values without replacing the editable field', async () => {
  await render('Draft');
  await act(() => type('Draft edited'));
  await render('Draft edited');
  await render('Imported name');
  expect(native.buffer).toBe('Imported name');
  await render('');
  expect(native.buffer).toBe('');
  expect(native.writes).toEqual(['Imported name', '']);
  expect(native.mounts).toBe(1);
});

it('commits the native Enter buffer and clears it without replaying older composing echoes', async () => {
  const submitted = vi.fn();
  const changed = vi.fn();
  const draw = async (value: string) =>
    act(() =>
      root.render(
        <CreationField
          value={value}
          accessibilityLabel="Tag"
          onChangeText={changed}
          onSubmitValue={submitted}
        />,
      ),
    );
  await draw('');
  await act(() => {
    type('n');
    type('你');
    type('你\n');
  });
  expect(submitted).toHaveBeenCalledExactlyOnceWith('你\n');
  expect(changed.mock.calls.map((call) => call[0])).toEqual(['n', '你']);
  expect(native.buffer).toBe('');
  await draw('n');
  await draw('你');
  await draw('');
  expect(native.buffer).toBe('');
  expect(native.writes).toEqual(['']);
  expect(native.mounts).toBe(1);
});

it('retains the native editable view while the first and last chips change', async () => {
  const draw = (hasChip: boolean) =>
    act(() =>
      root.render(
        <CreationField
          value="Pending"
          onSubmitValue={() => {}}
          leadingContent={hasChip ? <button>Tag</button> : null}
        />,
      ),
    );
  await draw(false);
  const field = container.querySelector('[data-field]');
  await draw(true);
  expect(container.querySelector('[data-field]')).toBe(field);
  await draw(false);
  expect(container.querySelector('[data-field]')).toBe(field);
  expect(native.buffer).toBe('Pending');
});
