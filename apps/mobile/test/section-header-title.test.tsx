// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const device = vi.hoisted(() => ({ os: 'android' }));
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  type Props = Record<string, unknown> & { children?: ReactNode };
  const style = (props: Props) =>
    JSON.stringify(
      shim.StyleSheet.flatten(
        typeof props.style === 'function' ? props.style({ pressed: false }) : props.style,
      ),
    );
  return {
    ...shim,
    Platform: {
      get OS() {
        return device.os;
      },
    },
    View: (props: Props) => createElement('div', { 'data-style': style(props) }, props.children),
    Text: (props: Props) =>
      createElement(
        'span',
        {
          'data-style': style(props),
          'data-lines': props.numberOfLines,
          'data-ellipsis': props.ellipsizeMode,
        },
        props.children,
      ),
  };
});
vi.mock('../src/ui/shell/icons', () => import('./shell-icons-shim'));

import { SectionHeader } from '../src/ui/chat/section-header';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  device.os = 'android';
});

function render(name: string) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <SectionHeader
        name={name}
        count={2}
        needsYou={0}
        unread={0}
        collapsed={false}
        onToggle={() => undefined}
      />,
    ),
  );
  const title = [...host.querySelectorAll('span')].find((span) =>
    span.textContent?.startsWith(name),
  )!;
  return { title, style: JSON.parse(title.getAttribute('data-style') ?? '{}') };
}

it('gives the Android section title the free row width so a two-word name never wraps out of view', () => {
  const { title, style } = render('Alice Work');
  expect(style.flex).toBe(1);
  expect(title.getAttribute('data-lines')).toBe('1');
  expect(title.getAttribute('data-ellipsis')).toBe('tail');
  expect(title.textContent).toBe('Alice Work 2');
});

it('keeps the iOS section title and count as separate shrink-wrapped labels', () => {
  device.os = 'ios';
  const { title, style } = render('Alice Work');
  expect(title.textContent).toBe('Alice Work');
  expect(style.flexShrink).toBe(1);
  expect(style.flex).toBeUndefined();
  expect(title.getAttribute('data-lines')).toBeNull();
});
