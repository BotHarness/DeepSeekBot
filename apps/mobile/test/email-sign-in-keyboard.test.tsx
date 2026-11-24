// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

type Layout = (event: { nativeEvent: { layout: { y: number; height: number } } }) => void;
const captured = vi.hoisted(() => ({
  scroll: undefined as Record<string, unknown> | undefined,
  layouts: new WeakMap<Element, Layout>(),
}));
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  const { createElement } = await import('react');
  return {
    ...shim,
    View: (props: Record<string, unknown> & { children?: never }) =>
      createElement(
        'div',
        {
          ref: (node: Element | null) => {
            if (node && typeof props['onLayout'] === 'function')
              captured.layouts.set(node, props['onLayout'] as Layout);
          },
          ...(props['testID'] === undefined ? {} : { 'data-testid': props['testID'] }),
        },
        props.children,
      ),
  };
});
vi.mock('react-native-keyboard-controller', async () => {
  const { createElement } = await import('react');
  return {
    KeyboardAwareScrollView: (props: Record<string, unknown>) => {
      captured.scroll = props;
      return createElement('div', null, props['children'] as never);
    },
  };
});
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));

import { EmailCodeSignIn } from '../src/ui/account/email-code-sign-in';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

const refused = async () => ({ ok: false as const, code: 'sign-in-failed' as const });

function layoutAround(host: HTMLElement, testID: string): Layout {
  let node = host.querySelector(`[data-testid="${testID}"]`)?.parentElement ?? null;
  while (node && !captured.layouts.has(node)) node = node.parentElement;
  expect(node).not.toBeNull();
  return captured.layouts.get(node!)!;
}

it('keeps the password Sign in button above the keyboard while the Email field is focused', () => {
  const host = document.createElement('div');
  root = createRoot(host);
  act(() =>
    root!.render(
      <EmailCodeSignIn
        flow={{
          password: { submit: refused, verify: refused, reset: refused },
          send: refused,
          verify: refused,
          browser: refused,
        }}
        finish={() => {}}
      />,
    ),
  );
  expect(host.querySelector('[data-testid="email-sign-in-password"]')).not.toBeNull();
  act(() =>
    layoutAround(host, 'email-sign-in-email')({ nativeEvent: { layout: { y: 300, height: 50 } } }),
  );
  act(() =>
    layoutAround(
      host,
      'email-sign-in-password-submit',
    )({
      nativeEvent: { layout: { y: 416, height: 50 } },
    }),
  );
  expect(captured.scroll!['bottomOffset']).toBeGreaterThanOrEqual(466 - 350);
});
