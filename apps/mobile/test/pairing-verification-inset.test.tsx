// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ os: 'android', content: undefined as unknown }));
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return {
    ...shim,
    Platform: {
      get OS() {
        return native.os;
      },
      select: <T,>(options: { default?: T }) => options.default,
    },
    ScrollView: (props: { contentContainerStyle?: unknown; children?: ReactNode }) => {
      native.content = props.contentContainerStyle;
      return <div data-testid="verification-scroll">{props.children}</div>;
    },
  };
});
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 48, left: 0 }),
}));
vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));
vi.mock('../src/ui/primitives/pairing-actions', () => ({ PairingActions: () => null }));
vi.mock('../src/ui/primitives/copyable-fingerprint', () => ({ CopyableFingerprint: () => null }));
vi.mock('../src/ui/primitives/loading-indicator', () => ({ LoadingIndicator: () => null }));

import { space } from '../src/ui/design/tokens';
import { PairingVerification } from '../src/ui/shell/pairing-verification';
import type { usePairing } from '../src/ui/shell/use-pairing';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

const pairing = { paired: false, abort: vi.fn() } as unknown as ReturnType<typeof usePairing>;

function render(os: string): unknown {
  native.os = os;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<PairingVerification pairing={pairing} />));
  return native.content;
}

it('pads the end of the verification step above the Android navigation bar', () => {
  expect(render('android')).toMatchObject({ paddingBottom: 48 + space.x6 });
});

it('leaves the iOS home-indicator inset to the automatic content inset', () => {
  expect(render('ios')).toMatchObject({ paddingBottom: space.x6 });
});
