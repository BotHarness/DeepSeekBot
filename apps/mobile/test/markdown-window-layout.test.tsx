// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const geometry = vi.hoisted(() => ({ width: 400 }));
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  const React = await import('react');
  type Props = {
    children?: React.ReactNode;
    style?: { width?: number; minWidth?: number; height?: number; maxWidth?: string };
    onLayout?: (event: { nativeEvent: { layout: { width: number; height: number } } }) => void;
    testID?: string;
  };
  const View = React.forwardRef<HTMLDivElement, Props>(function LayoutView(props, forwarded) {
    const attach = React.useCallback(
      (node: HTMLDivElement | null) => {
        if (typeof forwarded === 'function') forwarded(node);
        else if (forwarded) forwarded.current = node;
        if (node === null || props.onLayout === undefined) return;
        const content =
          props.testID === 'markdown-document'
            ? Math.max(
                0,
                ...[...node.querySelectorAll('span')].map((span) => span.textContent?.length ?? 0),
              )
            : (node.textContent?.length ?? 0);
        const width =
          props.style?.width ??
          Math.max(props.style?.minWidth ?? 0, Math.min(geometry.width * 0.8, content * 8));
        if (props.testID === 'markdown-document') node.dataset.measuredWidth = String(width);
        props.onLayout({ nativeEvent: { layout: { width, height: 20.25 } } });
      },
      [forwarded, props.onLayout, props.style, props.testID],
    );
    return (
      <div
        ref={attach}
        data-native-document={props.testID === 'markdown-document' ? '' : undefined}
      >
        {props.children}
      </div>
    );
  });
  return {
    ...shim,
    View,
    useWindowDimensions: () => ({ width: geometry.width, height: 800, scale: 2, fontScale: 1 }),
  };
});
vi.mock('react-native-reanimated', async () => {
  const shim = await import('./reanimated-shim');
  const { View } = await import('react-native');
  return {
    ...shim,
    default: {
      ...shim.default,
      View: (props: object) => <View {...props} testID="markdown-document" />,
    },
  };
});
vi.mock('../src/ui/markdown-viewport', async () => {
  const { useCallback, useState } = await import('react');
  return {
    useMarkdownViewport: () => {
      const [width, setWidth] = useState(0);
      const onLayout = useCallback(
        (event: { nativeEvent: { layout: { width: number } } }) =>
          setWidth(event.nativeEvent.layout.width),
        [],
      );
      return {
        enabled: true,
        ref: () => {},
        onLayout,
        width,
        visible: { top: 100000, height: 100 },
      };
    },
  };
});
vi.mock('react-native-enriched-markdown', () => ({ EnrichedMarkdownText: () => null }));
vi.mock('../src/ui/chat/message-menu', () => ({ copyMessage: () => {} }));

import { MarkdownView } from '../src/ui/markdown-view.android';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let cleanup = () => {};
afterEach(() => {
  cleanup();
  geometry.width = 400;
});

it('preserves a hidden bubble width and remeasures it after a window resize', async () => {
  const body =
    Array.from({ length: 100 }, (_, i) => `${'Long paragraph '.repeat(5)}${i}.\n\n`).join('') +
    'Tail';
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  await act(async () => root.render(<MarkdownView source={body} />));
  expect(container.textContent).toBe('Tail');
  expect(
    container.querySelector('[data-native-document]')?.getAttribute('data-measured-width'),
  ).toBe('320');
  geometry.width = 200;
  await act(async () => root.render(<MarkdownView source={body + ' more'} />));
  expect(container.textContent).toBe('Tail more');
  expect(
    container.querySelector('[data-native-document]')?.getAttribute('data-measured-width'),
  ).toBe('160');
});

it('lets a narrow bubble grow when later streamed text needs more width', async () => {
  const body = 'a\n\n'.repeat(100) + 'b';
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  await act(async () => root.render(<MarkdownView source={body} />));
  expect(container.textContent).toBe('b');
  expect(
    container.querySelector('[data-native-document]')?.getAttribute('data-measured-width'),
  ).toBe('8');
  const tail = 'b' + 'z'.repeat(100);
  await act(async () => root.render(<MarkdownView source={body + 'z'.repeat(100)} />));
  expect(container.textContent).toBe(tail);
  expect(
    container.querySelector('[data-native-document]')?.getAttribute('data-measured-width'),
  ).toBe('320');
});
