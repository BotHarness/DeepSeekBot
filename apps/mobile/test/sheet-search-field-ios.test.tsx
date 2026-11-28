// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-keyboard-controller', () => ({ KeyboardController: { dismiss: vi.fn() } }));
vi.mock('expo', () => ({
  requireNativeView:
    () =>
    ({
      query,
      onQueryChange,
    }: {
      query: { value: string; eventCount: number };
      onQueryChange(event: { nativeEvent: { value: string; eventCount: number } }): void;
    }) => (
      <>
        <output>{JSON.stringify(query)}</output>
        <button
          onClick={() => {
            onQueryChange({ nativeEvent: { value: 'Ced', eventCount: 1 } });
            onQueryChange({ nativeEvent: { value: 'Cedar', eventCount: 2 } });
          }}
        >
          Type
        </button>
        <button onClick={() => onQueryChange({ nativeEvent: { value: '', eventCount: 3 } })}>
          Clear
        </button>
      </>
    ),
}));

import { SheetSearchField } from '../src/ui/primitives/sheet-search-field.ios';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Search() {
  const [value, setValue] = useState('');
  return <SheetSearchField value={value} placeholder="Search" inset={0} onChangeText={setValue} />;
}

it('sends the latest query and its native edit count back together, including after clear', () => {
  const element = document.createElement('div');
  const root = createRoot(element);
  try {
    act(() => root.render(<Search />));
    const [type, clear] = element.querySelectorAll('button');
    act(() => type!.click());
    expect(element.querySelector('output')?.textContent).toBe(
      JSON.stringify({ value: 'Cedar', eventCount: 2 }),
    );
    act(() => clear!.click());
    expect(element.querySelector('output')?.textContent).toBe(
      JSON.stringify({ value: '', eventCount: 3 }),
    );
  } finally {
    act(() => root.unmount());
  }
});
