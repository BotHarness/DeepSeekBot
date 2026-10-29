// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  available: true,
  props: [] as Record<string, unknown>[],
  color: -1 as unknown,
}));
vi.mock('expo', () => ({
  requireOptionalNativeModule: () => (native.available ? {} : undefined),
  requireNativeView: () => (props: Record<string, unknown>) => {
    native.props.push(props);
    return <div>{props.children as never}</div>;
  },
}));
vi.mock('react-native', () => ({
  View: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  StyleSheet: { flatten: (style: unknown) => style },
  processColor: () => native.color,
}));

const host = document.createElement('div');
let root = createRoot(host);
afterEach(() => {
  act(() => root.unmount());
  root = createRoot(host);
  native.props.length = 0;
  native.available = true;
  native.color = -1;
  vi.resetModules();
});

it('preserves the real child identity when streaming completes and restarts', async () => {
  const { StreamSurface } = await import('../src/ui/primitives/stream-surface.ios');
  let mounts = 0;
  function Content() {
    useEffect(() => {
      mounts++;
    }, []);
    return <input defaultValue="Draft selection" />;
  }
  const render = (active: boolean) =>
    act(() =>
      root.render(
        <StreamSurface active={active} style={{ borderRadius: 16, borderBottomLeftRadius: 4 }}>
          <Content />
        </StreamSurface>,
      ),
    );
  render(true);
  const input = host.querySelector('input');
  render(false);
  render(true);
  expect(host.querySelector('input')).toBe(input);
  expect(host.querySelectorAll('input')).toHaveLength(1);
  expect(mounts).toBe(1);
  expect(native.props.map(({ active }) => active)).toEqual([true, false, true]);
  expect(native.props[0]).toMatchObject({ corners: [16, 16, 16, 4], duration: 120, mass: 1 });
});

it('keeps old native binaries readable without the new module', async () => {
  native.available = false;
  const { StreamSurface } = await import('../src/ui/primitives/stream-surface.ios');
  act(() => root.render(<StreamSurface active>Visible reply</StreamSurface>));
  expect(host.textContent).toBe('Visible reply');
  expect(host.querySelector('section')).not.toBeNull();
  expect(native.props).toHaveLength(0);
});

it.each(['50%', Number.NaN] as const)(
  'preserves unsupported corner styles (%s)',
  async (radius) => {
    const { StreamSurface } = await import('../src/ui/primitives/stream-surface.ios');
    act(() =>
      root.render(
        <StreamSurface active style={{ borderRadius: radius }}>
          Reply
        </StreamSurface>,
      ),
    );
    expect(host.textContent).toBe('Reply');
    expect(native.props).toHaveLength(0);
  },
);

it('preserves dynamic color semantics when the native color cannot be serialized', async () => {
  native.color = { dynamic: {} };
  const { StreamSurface } = await import('../src/ui/primitives/stream-surface.ios');
  act(() => root.render(<StreamSurface active>Reply</StreamSurface>));
  expect(host.textContent).toBe('Reply');
  expect(native.props).toHaveLength(0);
});
