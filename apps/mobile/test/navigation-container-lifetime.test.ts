import { describe, expect, it } from 'vitest';
import { createNavigationRefBinding } from 'expo-router/build/global-state/navigationRefBinding';

const previous = { name: 'previous', isReady: () => true };
const rendered = { name: 'rendered', isReady: () => true };
const target = () => ({ current: null as typeof rendered | null });

describe('navigation container lifetime', () => {
  it('keeps the rendered container usable when the replaced root finishes unmounting', () => {
    const ref = target();
    const oldRoot = createNavigationRefBinding(ref);
    const newRoot = createNavigationRefBinding(ref);
    oldRoot(previous);
    newRoot(rendered);
    oldRoot(null);
    expect(ref.current).toBe(rendered);
    expect(ref.current?.isReady()).toBe(true);
  });

  it('does not let cleanup from an unbound root disconnect the rendered container', () => {
    const ref = { current: rendered as typeof rendered | null };
    createNavigationRefBinding(ref)(null);
    expect(ref.current).toBe(rendered);
  });

  it('releases the container when its current root unmounts', () => {
    const ref = target();
    const bind = createNavigationRefBinding(ref);
    bind(rendered);
    bind(null);
    expect(ref.current).toBeNull();
  });

  it('supports replacing a controller within the same root before unmount', () => {
    const ref = target();
    const bind = createNavigationRefBinding(ref);
    bind(previous);
    bind(rendered);
    expect(ref.current).toBe(rendered);
    bind(null);
    expect(ref.current).toBeNull();
  });
});
