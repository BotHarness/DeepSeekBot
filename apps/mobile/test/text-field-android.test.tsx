// @vitest-environment jsdom
import { act, createElement, useRef, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TextFieldProps } from '../src/ui/primitives/text-field';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));
type FieldProps = Record<string, unknown> & {
  onValueChange?: (value: string) => void;
  onFocusChanged?: (focused: boolean) => void;
  keyboardActions?: Record<string, (value: string) => void>;
  children?: ReactNode;
};
const native = vi.hoisted(() => ({
  buffer: '',
  writes: [] as string[],
  mounts: 0,
  blurs: 0,
  props: {} as FieldProps,
}));
vi.mock('@expo/ui/jetpack-compose', async () => {
  const { useImperativeHandle } = await import('react');
  const slot =
    (name: string) =>
    ({ children }: { children?: ReactNode }) =>
      createElement('div', { 'data-slot': name }, children);
  const Field = Object.assign(
    ({ ref, children, ...props }: FieldProps & { ref?: unknown }) => {
      native.props = props;
      useImperativeHandle(ref as never, () => ({
        blur: async () => {
          native.blurs++;
        },
      }));
      return createElement('div', null, children);
    },
    {
      Label: slot('label'),
      Placeholder: slot('placeholder'),
      SupportingText: slot('supporting'),
    },
  );
  return {
    Host: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
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
import { TextField } from '../src/ui/primitives/text-field.android';
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  native.buffer = '';
  native.writes = [];
  native.mounts = 0;
  native.blurs = 0;
  native.props = {};
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
});
async function render(props: TextFieldProps) {
  await act(() => root.render(<TextField {...props} />));
}
let restore: (value: string) => void = () => {};
function Draft({ initial, onChange }: { initial: string; onChange?: (text: string) => void }) {
  const [value, setValue] = useState(initial);
  restore = setValue;
  return (
    <TextField
      value={value}
      accessibilityLabel="Name"
      onChangeText={(text) => {
        onChange?.(text);
        setValue(text);
      }}
    />
  );
}
function deliver(delivered: string, ahead = delivered) {
  native.buffer = ahead;
  native.props.onValueChange?.(delivered);
}
function slot(name: string) {
  return container.querySelector(`[data-slot="${name}"]`)?.textContent;
}

it('renders the Material label, placeholder, error and supporting text', async () => {
  await render({
    value: '',
    accessibilityLabel: 'Bot name',
    placeholder: 'Ocean',
    supportingText: 'Name is taken',
    invalid: true,
  });
  expect(slot('label')).toBe('Bot name');
  expect(slot('placeholder')).toBe('Ocean');
  expect(slot('supporting')).toBe('Name is taken');
  expect(native.props['isError']).toBe(true);
  await render({ value: '', accessibilityLabel: 'Name', label: 'Other', placeholder: 'Other' });
  expect(slot('label')).toBe('Other');
  expect(slot('placeholder')).toBeUndefined();
  expect(slot('supporting')).toBeUndefined();
  expect(native.props['isError']).toBe(false);
});

it('keeps newer native text when older draft echoes arrive during fast or composing input', async () => {
  const changed = vi.fn();
  await act(() => root.render(<Draft initial="" onChange={changed} />));
  await act(() => deliver('n', '你'));
  expect(native.buffer).toBe('你');
  await act(() => deliver('ni', '你'));
  expect(native.buffer).toBe('你');
  await act(() => deliver('你'));
  await act(() => {
    deliver('你好');
    deliver('你好 O');
    deliver('你好 Oc');
  });
  expect(changed.mock.calls.map((call) => call[0])).toEqual([
    'n',
    'ni',
    '你',
    '你好',
    '你好 O',
    '你好 Oc',
  ]);
  expect(native.buffer).toBe('你好 Oc');
  expect(native.writes).toEqual([]);
  expect(native.mounts).toBe(1);
});

it('applies restored or prefilled values without replacing the editable field', async () => {
  await act(() => root.render(<Draft initial="Draft" />));
  await act(() => deliver('Draft edited'));
  await act(() => restore('Imported name'));
  expect(native.buffer).toBe('Imported name');
  await act(() => restore(''));
  expect(native.buffer).toBe('');
  expect(native.writes).toEqual(['Imported name', '']);
  expect(native.mounts).toBe(1);
});

it('returns to the value a parent kept when it rejects or reshapes typed text', async () => {
  function Digits() {
    const [value, setValue] = useState('12');
    return (
      <TextField
        value={value}
        keyboardType="number-pad"
        onChangeText={(next) => {
          if (/^\d{0,3}$/.test(next)) setValue(next.slice(0, 2));
        }}
      />
    );
  }
  await act(() => root.render(<Digits />));
  await act(() => deliver('12a'));
  expect(native.buffer).toBe('12');
  await act(() => deliver('123'));
  expect(native.buffer).toBe('12');
  expect(native.mounts).toBe(1);
});

it('keeps submit, keyboard type, secure entry and max length', async () => {
  const submitted = vi.fn();
  await render({
    value: 'secret',
    secureTextEntry: true,
    maxLength: 16,
    returnKeyType: 'done',
    onSubmitEditing: (event) => submitted(event.nativeEvent.text),
  });
  expect(native.props['maxLength']).toBe(16);
  expect(native.props['visualTransformation']).toBe('password');
  expect(native.props['keyboardOptions']).toMatchObject({
    keyboardType: 'password',
    imeAction: 'done',
    autoCorrectEnabled: false,
  });
  await act(() => native.props.keyboardActions?.['onDone']?.('secret'));
  expect(submitted).toHaveBeenCalledWith('secret');
  expect(native.blurs).toBe(1);

  await render({ value: '', keyboardType: 'url', autoCapitalize: 'none', returnKeyType: 'go' });
  expect(native.props['keyboardOptions']).toMatchObject({
    keyboardType: 'uri',
    capitalization: 'none',
    imeAction: 'go',
  });
  expect(native.props.keyboardActions?.['onGo']).toBeTypeOf('function');
  expect(native.props['singleLine']).toBe(true);

  await render({ value: '', keyboardType: 'email-address', multiline: true, numberOfLines: 3 });
  expect(native.props['keyboardOptions']).toMatchObject({
    keyboardType: 'email',
    imeAction: 'default',
  });
  expect(native.props.keyboardActions).toEqual({});
  expect(native.props['singleLine']).toBe(false);
  expect(native.props['minLines']).toBe(3);
  expect(native.props['visualTransformation']).toBe('none');
});

it('reports focus to the field owner', async () => {
  const focus = vi.fn();
  const blur = vi.fn();
  await render({ value: 'a', onFocus: () => focus(), onBlur: () => blur(), autoFocus: true });
  expect(native.props['autoFocus']).toBe(true);
  await act(() => native.props.onFocusChanged?.(true));
  await act(() => native.props.onFocusChanged?.(false));
  expect(focus).toHaveBeenCalledTimes(1);
  expect(blur).toHaveBeenCalledTimes(1);
});
