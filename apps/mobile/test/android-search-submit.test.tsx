// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('expo', () => ({
  requireNativeView:
    () =>
    ({ onSubmit }: { onSubmit(event: { nativeEvent: { value: string } }): void }) => (
      <button onClick={() => onSubmit({ nativeEvent: { value: 'latest native query' } })}>
        Submit search
      </button>
    ),
}));

import { SearchField } from '../src/ui/primitives/search-field.android';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('forwards the native submitted query instead of the earlier React value', () => {
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  const submit = vi.fn<(text: string) => void>();
  try {
    act(() =>
      root.render(
        <SearchField
          inset={0}
          value="earlier React query"
          placeholder="Search"
          onChangeText={() => {}}
          onSubmitEditing={submit}
        />,
      ),
    );
    act(() => element.querySelector('button')!.click());
    expect(submit).toHaveBeenCalledWith('latest native query');
  } finally {
    act(() => root.unmount());
    element.remove();
  }
});
