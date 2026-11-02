// @vitest-environment jsdom
import { act, useRef, type ReactNode, type Ref } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ turn: { value: 0 }, cancelled: 0 }));
vi.mock('react-native-reanimated', () => ({
  default: {
    View: ({ children, testID }: { children: ReactNode; testID: string }) => (
      <div data-testid={testID}>{children}</div>
    ),
  },
  cancelAnimation: () => {
    state.cancelled += 1;
  },
  Easing: { linear: (t: number) => t },
  ReduceMotion: { System: 'system' },
  useAnimatedStyle: (worklet: () => object) => worklet(),
  useReducedMotion: () => false,
  useSharedValue: () => useRef(state.turn).current,
  withRepeat: () => 237,
  withTiming: (value: number) => value,
}));
vi.mock('react-native-svg', () => ({
  default: ({ children, ref }: { children: ReactNode; ref?: Ref<HTMLElement> }) => (
    <i ref={ref}>{children}</i>
  ),
  Circle: () => null,
  Path: () => null,
}));
vi.mock('../src/ui/theme', () => ({ useTheme: () => ({ ink: '#000', inkSoft: '#666' }) }));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ layer: { canvas: { fill: '#fff' } } }),
}));

import { RowStatusGlyph } from '../src/ui/chat/row-status-glyph';
import type { RowStatus } from '../src/ui/chat/conversations';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  state.turn = { value: 0 };
  state.cancelled = 0;
});

function render(status: RowStatus) {
  act(() => root!.render(<RowStatusGlyph status={status} />));
}

describe('RowStatusGlyph', () => {
  it('returns the done check upright after the working spinner stops mid-turn', () => {
    root = createRoot(document.createElement('div'));
    render('working');
    expect(state.turn.value).toBe(237);
    render('done');
    expect(state.cancelled).toBe(1);
    expect(state.turn.value).toBe(0);
  });

  it('leaves non-spinning statuses at rest', () => {
    root = createRoot(document.createElement('div'));
    render('done-unread');
    render('needs-you');
    expect(state.cancelled).toBe(0);
    expect(state.turn.value).toBe(0);
  });
});
