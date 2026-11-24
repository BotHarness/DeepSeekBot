// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({
  sticky: undefined as { closed: number; opened: number } | undefined,
  scroll: undefined as { offset: number; blankSpace: number } | undefined,
  keyboard: 0,
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: () => undefined }));
vi.mock('react-native-reanimated', () => ({
  useDerivedValue: (compute: () => number) => ({ value: compute() }),
  useAnimatedStyle: (compute: () => unknown) => compute(),
}));
vi.mock('react-native-keyboard-controller', () => ({
  KeyboardProvider: ({ children }: { children: ReactNode }) => children,
  KeyboardStickyView: ({
    children,
    offset,
  }: {
    children: ReactNode;
    offset: { closed: number; opened: number };
  }) => {
    seen.sticky = offset;
    return <div data-testid="sticky">{children}</div>;
  },
  KeyboardChatScrollView: (props: { offset: number; blankSpace: { value: number } }) => {
    seen.scroll = { offset: props.offset, blankSpace: props.blankSpace.value };
    return null;
  },
  useKeyboardHandler: () => undefined,
  useReanimatedKeyboardAnimation: () => ({ height: { value: -seen.keyboard } }),
}));

import { ChatIslandInset } from '../src/ui/primitives/chat-keyboard';
import { KeyboardChatFrame } from '../src/ui/primitives/keyboard-frame.android';
import {
  useChatOverlayStyle,
  useChatScrollAdapter,
} from '../src/ui/primitives/chat-scroll.android';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const keyboard = { onStart: () => {}, onEnd: () => {}, onInsetChange: () => {} };

function Timeline({ overlay }: { overlay: (style: unknown) => void }) {
  const render = useChatScrollAdapter(keyboard, false);
  overlay(useChatOverlayStyle());
  return <>{render({})}</>;
}

function mount(island: number) {
  const styles: unknown[] = [];
  const root = createRoot(document.createElement('div'));
  act(() =>
    root.render(
      <ChatIslandInset value={island}>
        <KeyboardChatFrame
          composer={<span />}
          backgroundColor="white"
          onMount={() => {}}
          onComposerLayout={() => {}}
        >
          <Timeline overlay={(style) => styles.push(style)} />
        </KeyboardChatFrame>
      </ChatIslandInset>,
    ),
  );
  return { root, styles };
}

describe('Android chat over the tab island', () => {
  it('keeps the timeline full height and lets the keyboard absorb the island band', () => {
    const { root } = mount(104);
    expect(seen.sticky).toEqual({ closed: -104, opened: 0 });
    expect(seen.scroll).toEqual({ offset: 0, blankSpace: 104 });
    act(() => root.unmount());
  });

  it('keeps overlays above the island until the keyboard is taller than it', () => {
    seen.keyboard = 0;
    const closed = mount(104);
    expect(closed.styles.at(-1)).toEqual({ bottom: 104 });
    act(() => closed.root.unmount());
    seen.keyboard = 300;
    const open = mount(104);
    expect(open.styles.at(-1)).toEqual({ bottom: 300 });
    act(() => open.root.unmount());
    seen.keyboard = 0;
  });

  it('is unchanged without an island', () => {
    const { root } = mount(0);
    expect(seen.sticky).toEqual({ closed: 0, opened: 0 });
    expect(seen.scroll).toEqual({ offset: 0, blankSpace: 0 });
    act(() => root.unmount());
  });
});
