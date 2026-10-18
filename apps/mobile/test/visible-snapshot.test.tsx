// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import { useVisibleSnapshot } from '../src/host/use-visible-snapshot';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function store(initial: string) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(next: string) {
      value = next;
      for (const listener of listeners) listener();
    },
    listeners,
  };
}

describe('visible snapshot subscription', () => {
  it('stops offscreen invalidations, catches up on focus and isolates a different Host', () => {
    const first = store('first Host');
    const second = store('second Host');
    let rendered = '';
    let renders = 0;
    function Probe({ source, visible }: { source: typeof first; visible: boolean }) {
      rendered = useVisibleSnapshot(source, visible);
      renders++;
      return null;
    }
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe source={first} visible />));
    act(() => first.update('first update'));
    expect(rendered).toBe('first update');
    act(() => root.render(<Probe source={first} visible={false} />));
    const heldRenders = renders;
    expect(first.listeners.size).toBe(0);
    act(() => first.update('latest first'));
    expect(renders).toBe(heldRenders);
    act(() => root.render(<Probe source={first} visible={false} />));
    expect(rendered).toBe('first update');
    act(() => root.render(<Probe source={first} visible />));
    expect(rendered).toBe('latest first');
    act(() => root.render(<Probe source={second} visible={false} />));
    expect(rendered).toBe('second Host');
    expect(first.listeners.size).toBe(0);
    act(() => second.update('latest second'));
    act(() => root.render(<Probe source={second} visible />));
    expect(rendered).toBe('latest second');
    act(() => root.unmount());
    expect(second.listeners.size).toBe(0);
  });
});
