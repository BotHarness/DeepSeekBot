// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { SharedValue } from 'react-native-reanimated';

const probe = vi.hoisted(() => ({ views: new Map<string, Record<string, unknown>>() }));
vi.mock('react-native-reanimated', () => ({
  default: {
    View: (props: Record<string, unknown>) => {
      probe.views.set(String(props['testID']), props);
      return createElement('div', { 'data-testid': props['testID'] });
    },
  },
  useAnimatedStyle: (worklet: () => object) => worklet,
}));
import { ComposerAnimatedFade } from '../src/ui/chat/composer-animated-fade';
import { edgeFade, space } from '../src/ui/design/tokens';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  probe.views.clear();
});

function read(id: string) {
  const styles = probe.views.get(id)!['style'] as Array<object | (() => object)>;
  return Object.assign(
    {},
    ...styles.map((style) => (typeof style === 'function' ? style() : style)),
  );
}

it('moves the real fade boundary during shrink before a new outer layout arrives', () => {
  const inset = { value: 208 } as SharedValue<number>;
  root = createRoot(document.createElement('div'));
  const measured = 184 - space.x3 - space.x2;
  act(() =>
    root!.render(
      <ComposerAnimatedFade inset={inset} measuredCover={measured} color="currentColor">
        <div />
      </ComposerAnimatedFade>,
    ),
  );
  inset.value = 96;
  const cover = 72 - space.x3 - space.x2;
  expect(read('composer-fade-follower').transform).toEqual([{ translateY: 112 }]);
  expect(read('composer-fade-solid').height).toBe(cover);
  const originalTop = 800 - measured - edgeFade.bottom;
  expect(originalTop + read('composer-fade-follower').transform[0].translateY).toBe(
    800 - cover - edgeFade.bottom,
  );
});

it('fills the bottom when expanding and clamps an unknown initial inset', () => {
  const inset = { value: 96 } as SharedValue<number>;
  root = createRoot(document.createElement('div'));
  const measured = 72 - space.x3 - space.x2;
  act(() =>
    root!.render(
      <ComposerAnimatedFade inset={inset} measuredCover={measured} color="currentColor">
        <div />
      </ComposerAnimatedFade>,
    ),
  );
  inset.value = 208;
  expect(read('composer-fade-follower').transform).toEqual([{ translateY: -112 }]);
  expect(read('composer-fade-solid')).toMatchObject({
    bottom: -1,
    height: 184 - space.x3 - space.x2,
    backgroundColor: 'currentColor',
  });
  inset.value = 0;
  expect(read('composer-fade-solid').height).toBe(0);
  expect(read('composer-fade-follower').transform).toEqual([{ translateY: measured }]);
});
