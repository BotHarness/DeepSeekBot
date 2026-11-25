// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const scroll = vi.hoisted(() => ({ props: undefined as Record<string, unknown> | undefined }));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-keyboard-controller', async () => {
  const { createElement } = await import('react');
  return {
    KeyboardAwareScrollView: (props: Record<string, unknown>) => {
      scroll.props = props;
      return createElement('div', null, props['children'] as never);
    },
  };
});

import { scrollDistanceWithRespectToSnapPoints } from '../node_modules/react-native-keyboard-controller/src/components/KeyboardAwareScrollView/utils';
import { KeyboardFormScroll } from '../src/ui/primitives/keyboard-form';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const HEADING_END = 228;
const APPLE = { start: 244, end: 300 };
const GOOGLE = { start: 316, end: 372 };

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  scroll.props = undefined;
});

function revealTo(exact: number, revealPast = HEADING_END, snapToOffsets?: number[]) {
  act(() => root?.unmount());
  root = createRoot(document.createElement('div'));
  act(() =>
    root!.render(
      <KeyboardFormScroll
        revealPast={revealPast}
        revealBands={[GOOGLE, APPLE]}
        {...(snapToOffsets ? { snapToOffsets } : {})}
      >
        <span>Sign in</span>
      </KeyboardFormScroll>,
    ),
  );
  return scrollDistanceWithRespectToSnapPoints(
    exact,
    scroll.props!['snapToOffsets'] as number[] | undefined,
  );
}

it('settles a keyboard reveal that would stop inside the heading with the heading fully scrolled away', () => {
  expect(revealTo(140)).toBe(HEADING_END);
});

it('settles a keyboard reveal that would stop inside a provider button at that button end', () => {
  expect(revealTo(260)).toBe(APPLE.end);
  expect(revealTo(330)).toBe(GOOGLE.end);
});

it('stops a reveal in the gap above a provider button with the button fully visible', () => {
  expect(revealTo(236)).toBe(APPLE.start);
});

it('keeps the exact keyboard reveal once it passes the heading and the provider buttons', () => {
  expect(revealTo(410)).toBe(410);
});

it('keeps the exact keyboard reveal in forms without a heading', () => {
  expect(revealTo(140, 0)).toBe(140);
});

it('keeps the stops a form passes itself when it has no heading', () => {
  expect(revealTo(140, 0, [180])).toBe(180);
});
