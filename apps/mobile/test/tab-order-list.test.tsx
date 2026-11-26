// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

type Pan = {
  start(): void;
  update(event: { translationY: number }): void;
  end(event: object, success: boolean): void;
};

const native = vi.hoisted(() => ({ pans: new Map<string, Pan>() }));

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('../src/ui/primitives/use-system-reduced-motion', () => ({
  useSystemReducedMotion: () => true,
}));
vi.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({
    children,
    gesture,
  }: {
    children: ReactElement<{ testID: string }>;
    gesture: { pan: Pan };
  }) => {
    native.pans.set(children.props.testID, gesture.pan);
    return children;
  },
  Gesture: {
    Pan: () => {
      const pan: Pan = { start() {}, update() {}, end() {} };
      const gesture = {
        pan,
        onStart: (callback: Pan['start']) => {
          pan.start = callback;
          return gesture;
        },
        onUpdate: (callback: Pan['update']) => {
          pan.update = callback;
          return gesture;
        },
        onEnd: (callback: Pan['end']) => {
          pan.end = callback;
          return gesture;
        },
      };
      return gesture;
    },
  },
}));

import { TabOrderList } from '../src/ui/primitives/tab-order-list';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('commits a completed drag and discards the same drop when the pan is cancelled', async () => {
  const root = createRoot(document.createElement('div'));
  const onMove = vi.fn();
  try {
    await act(async () =>
      root.render(
        <TabOrderList
          title="Order"
          copy={t.tabBarSettings}
          items={[
            { key: 'chats', label: 'Chats', symbol: { ios: 'bubble', android: 'forum' } },
            { key: 'pinned', label: 'Pinned', symbol: { ios: 'pin', android: 'keep' } },
          ]}
          onMove={onMove}
        />,
      ),
    );
    const pan = native.pans.get('tab-order-handle-chats')!;
    const event = { translationY: 120 };
    pan.start();
    pan.update(event);
    pan.end(event, false);
    expect(onMove).not.toHaveBeenCalled();

    pan.start();
    pan.update(event);
    pan.end(event, true);
    expect(onMove).toHaveBeenCalledExactlyOnceWith(0, 2);
  } finally {
    await act(async () => root.unmount());
    native.pans.clear();
  }
});
