// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createAvatarAnchor } from '../src/client/avatar-anchor.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { PersonaBotAvatar } from '../src/client/avatar.js';

it('captures the head bounds once and follows the displayed transform, including an interrupted pose', () => {
  const node = document.createElement('span');
  node.innerHTML = '<svg viewBox="0 0 32 32"><g class="bh-illustrated-head" /></svg>';
  document.body.append(node);
  const head = node.querySelector<SVGGraphicsElement>('g')!;
  const svg = node.querySelector('svg')!;
  const bounds = vi.fn(() => ({ x: 8, y: 4, width: 16, height: 20 }));
  let matrix = { a: 3, b: 0, c: 0, d: 3, e: 100, f: 500 };
  const projection = vi.fn(() => matrix);
  const coverProjection = vi.fn(() => ({ a: 3, b: 0, c: 0, d: 3, e: 100, f: 503 }));
  Object.defineProperty(head, 'getBBox', { value: bounds });
  Object.defineProperty(head, 'getScreenCTM', { value: projection });
  Object.defineProperty(svg, 'getScreenCTM', { value: coverProjection });
  try {
    const anchor = createAvatarAnchor(node);
    expect(anchor.read()).toEqual({ x: 148, y: 512 });
    matrix = { a: 0, b: 3, c: -3, d: 0, e: 200, f: 400 };
    expect(anchor.read()).toEqual({ x: 188, y: 448 });
    matrix = { a: 2.7, b: 0.4, c: -0.5, d: 3.2, e: 150, f: 470 };
    expect(anchor.read()).toEqual({ x: 191.2, y: 489.2 });
    expect(bounds).toHaveBeenCalledOnce();
    svg.setAttribute('data-pixel-cover', '');
    expect(anchor.read()).toEqual({ x: 148, y: 515 });
    expect(coverProjection).toHaveBeenCalledOnce();
    node.remove();
    expect(anchor.read()).toBeUndefined();
    expect(projection).toHaveBeenCalledTimes(3);
  } finally {
    node.remove();
  }
});

it('uses the current box top for images, unsupported rigs and unavailable SVG geometry', () => {
  const node = document.createElement('span');
  document.body.append(node);
  const rect = vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({
    left: 200,
    top: 500,
    right: 296,
    bottom: 596,
    x: 200,
    y: 500,
    width: 96,
    height: 96,
    toJSON: () => ({}),
  });
  try {
    const imageAnchor = createAvatarAnchor(node);
    expect(imageAnchor.read()).toEqual({ x: 248, y: 500 });
    node.innerHTML = '<svg><g class="bh-illustrated-head" /></svg>';
    const unavailableAnchor = createAvatarAnchor(node);
    expect(unavailableAnchor.read()).toEqual({ x: 248, y: 500 });
    expect(rect).toHaveBeenCalledTimes(2);
  } finally {
    node.remove();
  }
});

it('exposes a live companion anchor through Avatar ownership and clears it on replacement and disposal', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const anchorRef = vi.fn();
  const render = (surface: 'portrait' | 'companion', still = false) =>
    root.render(
      createElement(PersonaBotAvatar, {
        personaBotId: 'ada',
        name: 'Ada',
        size: 96,
        surface,
        still,
        anchorRef,
      }),
    );
  try {
    await act(() => render('portrait'));
    expect(anchorRef).not.toHaveBeenCalled();
    await act(() => render('companion'));
    expect(anchorRef.mock.calls.at(-1)![0]?.read).toBeTypeOf('function');
    const movingAnchor = anchorRef.mock.calls.at(-1)![0];
    await act(() => render('companion', true));
    expect(anchorRef.mock.calls.at(-1)![0]).not.toBe(movingAnchor);
    const stillAnchor = anchorRef.mock.calls.at(-1)![0];
    await act(() => render('companion'));
    expect(anchorRef.mock.calls.at(-1)![0]).not.toBe(stillAnchor);
    await act(() => render('portrait'));
    expect(anchorRef).toHaveBeenLastCalledWith(undefined);
    await act(() => render('companion'));
    await act(() => root.unmount());
    expect(anchorRef).toHaveBeenLastCalledWith(undefined);
  } finally {
    await act(() => root.unmount());
    node.remove();
  }
});
