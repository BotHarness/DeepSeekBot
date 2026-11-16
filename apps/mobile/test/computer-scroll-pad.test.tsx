// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

type PadProps = {
  testID?: string;
  children?: ReactNode;
  onAccessibilityAction?(event: { nativeEvent: { actionName: string } }): void;
};

const pad = vi.hoisted(() => ({ props: undefined as PadProps | undefined }));

vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: () => {} }));
vi.mock('react-native-gesture-handler', () => {
  const pan: Record<string, () => unknown> = {};
  for (const step of ['enabled', 'maxPointers', 'minDistance', 'onStart', 'onUpdate', 'onFinalize'])
    pan[step] = () => pan;
  return {
    Gesture: { Pan: () => pan },
    GestureDetector: ({ children }: { children: ReactNode }) => children,
  };
});
vi.mock('react-native-reanimated', () => ({
  default: {
    View: (props: PadProps) => {
      if (props.testID === 'computer-video-scroll-pad') pad.props = props;
      return createElement('div', null, props.children);
    },
  },
  useSharedValue: <T,>(value: T) => ({ get: () => value, set: () => {} }),
  useAnimatedStyle: () => ({}),
}));
vi.mock('../src/ui/chat/computer-mouse-icon', () => ({ ComputerMouseIcon: () => null }));

const { ComputerScrollPad } = await import('../src/ui/chat/computer-scroll-pad');
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  pad.props = undefined;
});

function render(onScroll: (axis: 'horizontal' | 'vertical', steps: number) => Promise<boolean>) {
  root = createRoot(document.createElement('div'));
  act(() => {
    root!.render(<ComputerScrollPad enabled compact={false} onScroll={onScroll} />);
  });
  return (actionName: string) => pad.props!.onAccessibilityAction!({ nativeEvent: { actionName } });
}

it('sends one scroll step per accessibility action on the matching axis', () => {
  const onScroll = vi.fn(async () => true);
  const perform = render(onScroll);
  for (const action of ['increment', 'decrement', 'scroll-left', 'scroll-right', 'activate'])
    perform(action);
  expect(onScroll.mock.calls).toEqual([
    ['vertical', 1],
    ['vertical', -1],
    ['horizontal', -1],
    ['horizontal', 1],
  ]);
});

it('keeps a failed or refused accessibility scroll from becoming an unhandled rejection', async () => {
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  try {
    const outcomes = [
      () => Promise.reject(new Error('viewer closed')),
      () => Promise.resolve(false),
    ];
    const calls: Array<[string, number]> = [];
    const perform = render((axis, steps) => {
      calls.push([axis, steps]);
      return outcomes.shift()!();
    });
    perform('increment');
    perform('scroll-right');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual([
      ['vertical', 1],
      ['horizontal', 1],
    ]);
    expect(unhandled).not.toHaveBeenCalled();
  } finally {
    process.off('unhandledRejection', unhandled);
  }
});
