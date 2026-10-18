// @vitest-environment jsdom
import { act, createElement, type Dispatch, type SetStateAction } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { useScopedRef, useScopedState } from '../src/client/scoped-state.js';

it('resets transient state without remounting and rejects callbacks from departed scopes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  let update!: Dispatch<SetStateAction<number>>;
  let currentRef!: { current: number };
  function View({ scope }: { scope: string }) {
    const [value, setValue] = useScopedState(scope, 0);
    update = setValue;
    currentRef = useScopedRef(scope, 0);
    return createElement('output', null, value);
  }
  const render = async (scope: string) => {
    await act(() => root.render(createElement(View, { scope })));
  };
  try {
    await render('A');
    const output = node.firstChild;
    const staleA = update;
    const refA = currentRef;
    await act(() => update(3));
    currentRef.current = 7;
    await render('A');
    expect(node.textContent).toBe('3');
    expect(currentRef.current).toBe(7);
    await render('B');
    expect(node.firstChild).toBe(output);
    expect(node.textContent).toBe('0');
    expect(currentRef).not.toBe(refA);
    await act(() => staleA(100));
    expect(node.textContent).toBe('0');
    await act(() => update((value) => value + 1));
    expect(node.textContent).toBe('1');
    await render('A');
    await act(() => staleA(200));
    expect(node.textContent).toBe('0');
    refA.current = 99;
    expect(currentRef.current).toBe(0);
    expect(node.firstChild).toBe(output);
  } finally {
    await act(() => root.unmount());
    node.remove();
  }
});
