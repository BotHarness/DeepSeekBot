// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  frames: [
    { pageY: 0, height: 834 },
    { pageY: -2051, height: 19418 },
    { pageY: 10449, height: 222 },
  ],
  nextRef: 0,
  react: () => {},
  scroll: { value: 16533 },
  scheduled: new Array<() => void>(),
}));
vi.mock('react-native', async () => {
  const React = await import('react');
  return {
    AccessibilityInfo: {
      isScreenReaderEnabled: async () => false,
      addEventListener: () => ({ remove() {} }),
    },
    View: ({
      ref,
      onLayout,
      children,
    }: {
      ref: React.Ref<HTMLDivElement>;
      onLayout: (event: { nativeEvent: { layout: { width: number; height: number } } }) => void;
      children: React.ReactNode;
    }) => {
      React.useLayoutEffect(() => {
        onLayout({ nativeEvent: { layout: { width: 194, height: 222 } } });
      }, [onLayout]);
      return <div ref={ref}>{children}</div>;
    },
  };
});
vi.mock('react-native-reanimated', async () => {
  const { useState } = await import('react');
  return {
    useSharedValue: <T,>(value: T) => useState(() => ({ value }))[0],
    useAnimatedRef: () =>
      useState(() => Object.assign(() => {}, { geometry: native.nextRef++ }))[0],
    measure: (ref: { geometry: number }) => native.frames[ref.geometry],
    useAnimatedReaction: <T,>(prepare: () => T, react: (value: T) => void) => {
      native.react = () => react(prepare());
    },
  };
});
vi.mock('react-native-worklets', () => ({
  scheduleOnRN: <T,>(callback: (value: T) => void, value: T) => {
    native.scheduled.push(() => callback(value));
  },
}));

import { View } from 'react-native';
import { useAnimatedRef, useSharedValue } from 'react-native-reanimated';
import type { ViewInstance } from 'react-native';
import { MarkdownViewportContext, useMarkdownViewport } from '../src/ui/markdown-viewport';
import { createMarkdownBlocks } from '../src/ui/markdown-blocks';
import { createMarkdownWindow, type MarkdownViewport } from '../src/ui/markdown-window';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let cleanup = () => {};
afterEach(() => {
  cleanup();
  native.nextRef = 0;
  native.scheduled.length = 0;
});

function Document() {
  const viewport = useMarkdownViewport();
  return (
    <View ref={viewport.ref} onLayout={viewport.onLayout}>
      <output>{JSON.stringify(viewport.visible)}</output>
    </View>
  );
}
function Conversation() {
  const viewport = useAnimatedRef<ViewInstance>();
  const content = useAnimatedRef<ViewInstance>();
  const scroll = useSharedValue(16533);
  const layout = useSharedValue(1);
  native.scroll = scroll;
  const stage = { viewport, content, scroll, layout, active: true };
  return (
    <MarkdownViewportContext.Provider value={stage}>
      <Document />
    </MarkdownViewportContext.Provider>
  );
}

it('restores blocks on the last return scroll event even while Fabric still measures the old offset', async () => {
  native.frames = [
    { pageY: 0, height: 834 },
    { pageY: -2051, height: 19418 },
    { pageY: 10449, height: 222 },
  ];
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  await act(async () => root.render(<Conversation />));
  const read = (): MarkdownViewport =>
    JSON.parse(container.querySelector('output')?.textContent ?? '{}');
  const flush = async () =>
    act(async () => {
      native.react();
      for (const callback of native.scheduled.splice(0)) callback();
    });
  const blocks = createMarkdownBlocks()('# Heading\n\nBody\n\nTail');
  const window = createMarkdownWindow();
  for (const [index, block] of blocks.entries())
    window.measure(block, index < blocks.length - 1, 100);
  await flush();
  expect(window.project(blocks, read()).some((part) => part.kind === 'space')).toBe(true);
  native.scroll.value = 12000;
  native.frames[1] = { pageY: -12000, height: 19418 };
  native.frames[2] = { pageY: 500, height: 222 };
  await flush();
  expect(window.project(blocks, read()).every((part) => part.kind === 'block')).toBe(true);
  expect(read().top).toBe(-500);
});
