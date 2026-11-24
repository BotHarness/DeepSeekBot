// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const scroll = vi.hoisted(() => ({ props: undefined as Record<string, unknown> | undefined }));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-keyboard-controller', async () => {
  const { createElement } = await import('react');
  return {
    KeyboardAwareScrollView: (props: Record<string, unknown>) => {
      scroll.props = props;
      return createElement('div', { 'data-testid': 'form-scroll' }, props['children'] as never);
    },
  };
});

import { KeyboardFormScroll } from '../src/ui/primitives/keyboard-form';
import { clippedHeight } from '../src/ui/primitives/keyboard-form-context';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

describe('clippedHeight', () => {
  it('reserves the part of a native scroll frame that hangs below its laid-out frame', () => {
    expect(clippedHeight(812, 714)).toBe(98);
  });

  it('reserves nothing when the frames agree or the layout is not measured yet', () => {
    expect(clippedHeight(714, 714)).toBe(0);
    expect(clippedHeight(519, 714)).toBe(0);
    expect(clippedHeight(812, 0)).toBe(0);
  });
});

describe('KeyboardFormScroll', () => {
  it('adds the overhang below the last field of a sheet form without a footer', () => {
    const host = document.createElement('div');
    root = createRoot(host);
    act(() =>
      root!.render(
        <KeyboardFormScroll>
          <span>Members</span>
        </KeyboardFormScroll>,
      ),
    );
    const spacer = () =>
      host.querySelector<HTMLElement>('[data-testid="keyboard-form-clipped-space"]');
    expect(spacer()).toBeNull();
    act(() =>
      (scroll.props!['onLayout'] as (event: unknown) => void)({
        nativeEvent: { layout: { height: 713.5 } },
      }),
    );
    act(() =>
      (scroll.props!['onScroll'] as (event: unknown) => void)({
        nativeEvent: { layoutMeasurement: { height: 812 } },
      }),
    );
    expect(spacer()).not.toBeNull();
    expect(host.querySelector('[data-testid="form-scroll"]')!.lastElementChild).toBe(spacer());
  });
});
