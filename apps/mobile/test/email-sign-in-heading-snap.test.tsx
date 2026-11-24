// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  scroll: undefined as Record<string, unknown> | undefined,
  views: new Map<string, Record<string, unknown>>(),
}));
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return {
    ...shim,
    View: (props: Record<string, unknown>) => {
      if (typeof props['testID'] === 'string') captured.views.set(props['testID'], props);
      return shim.View(props);
    },
  };
});
vi.mock('react-native-keyboard-controller', async () => {
  const shim = await import('./react-native-shim');
  return {
    KeyboardAwareScrollView: (props: Record<string, unknown>) => {
      captured.scroll = props;
      return shim.View(props);
    },
  };
});
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));
vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));

import type { EmailCodeFlow } from '@botharness/host-client/connect-account';
import { space } from '../src/ui/design/tokens';
import { EmailCodeSignIn } from '../src/ui/account/email-code-sign-in';
import { revealSnap } from '../src/ui/primitives/keyboard-form-context';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  captured.scroll = undefined;
  captured.views.clear();
});

const unused = async () => ({ ok: false as const, code: 'unavailable' as const });
const flow = {
  send: unused,
  verify: unused,
  browser: unused,
  password: { submit: unused, verify: unused, reset: unused },
} as unknown as EmailCodeFlow;

describe('Tobs sign-in heading under the sticky sheet header', () => {
  it('snaps a partly scrolled heading fully out of view or back into view', () => {
    root = createRoot(document.createElement('div'));
    act(() => root!.render(<EmailCodeSignIn flow={flow} finish={() => {}} />));
    const heading = captured.views.get('email-sign-in-heading');
    expect(heading).toBeDefined();
    act(() =>
      (heading!['onLayout'] as (event: unknown) => void)({
        nativeEvent: { layout: { x: 0, y: space.x3, width: 360, height: 212 } },
      }),
    );
    expect(captured.scroll!['snapToOffsets']).toEqual([212 + space.x4]);
    expect(captured.scroll!['snapToEnd']).toBe(false);
  });

  it('finishes a keyboard reveal that stops inside the heading with the heading fully out', () => {
    expect(revealSnap(150, [228])).toBe(228);
    expect(revealSnap(0, [228])).toBeUndefined();
    expect(revealSnap(228, [228])).toBeUndefined();
    expect(revealSnap(400, [228])).toBeUndefined();
    expect(revealSnap(150, [])).toBeUndefined();
  });
});
