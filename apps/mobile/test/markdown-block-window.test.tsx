// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

type Change = { nativeEvent: { hidden: boolean; width: number; height: number } };
const native = vi.hoisted(() => ({
  available: true,
  change: (_event: Change) => {},
}));
vi.mock('expo', () => ({
  requireOptionalNativeModule: () => (native.available ? {} : null),
  requireNativeView: () =>
    function NativeBlock(props: {
      children?: ReactNode;
      style?: { width: number; height: number };
      onWindowChange: (event: Change) => void;
    }) {
      native.change = props.onWindowChange;
      return <div style={props.style}>{props.children}</div>;
    },
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  native.available = true;
});

it('keeps JS as the default and falls back when the native module is absent', async () => {
  vi.stubEnv('EXPO_PUBLIC_MARKDOWN_WINDOW', 'js');
  expect(
    (await import('../src/ui/primitives/markdown-block-window.android')).nativeMarkdownWindow,
  ).toBe(false);
  vi.resetModules();
  vi.stubEnv('EXPO_PUBLIC_MARKDOWN_WINDOW', 'native');
  native.available = false;
  expect(
    (await import('../src/ui/primitives/markdown-block-window.android')).nativeMarkdownWindow,
  ).toBe(false);
});

it('replaces only eligible content with exact geometry and restores its content', async () => {
  vi.stubEnv('EXPO_PUBLIC_MARKDOWN_WINDOW', 'native');
  const { MarkdownBlockWindow } =
    await import('../src/ui/primitives/markdown-block-window.android');
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = (eligible: boolean) =>
    act(() =>
      root.render(
        <MarkdownBlockWindow eligible={eligible}>
          <span>Original text</span>
        </MarkdownBlockWindow>,
      ),
    );
  try {
    render(true);
    act(() => native.change({ nativeEvent: { hidden: true, width: 201.5, height: 40.25 } }));
    expect(container.textContent).toBe('');
    expect(container.firstElementChild?.getAttribute('style')).toContain('height: 40.25px');
    expect(container.firstElementChild?.getAttribute('style')).toContain('width: 201.5px');
    act(() => native.change({ nativeEvent: { hidden: false, width: 201.5, height: 40.25 } }));
    expect(container.textContent).toBe('Original text');
    act(() => native.change({ nativeEvent: { hidden: true, width: NaN, height: -1 } }));
    expect(container.textContent).toBe('Original text');
    render(false);
    act(() => native.change({ nativeEvent: { hidden: true, width: 201.5, height: 40.25 } }));
    expect(container.textContent).toBe('Original text');
  } finally {
    act(() => root.unmount());
  }
});
