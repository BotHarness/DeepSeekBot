// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PersonaBotAvatar } from '../src/client/avatar.js';
import {
  DEFAULT_ILLUSTRATED_RECIPE,
  type PixelMouthState,
} from '../../core/src/bots/avatar-appearance.js';

it('changes only companion speech layers while retaining head animation and restoring saved appearance at shared gates', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const animationTargets: Element[] = [];
  const cancel = vi.fn();
  const previousAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: function (this: Element) {
      animationTargets.push(this);
      return { cancel, finished: new Promise<void>(() => undefined) };
    },
  });
  const props = {
    personaBotId: 'ada',
    name: 'Ada',
    size: 96,
    state: 'working' as const,
    appearance: { recipe: DEFAULT_ILLUSTRATED_RECIPE, revision: 'a'.repeat(64) },
  };
  const render = (mouth: PixelMouthState) =>
    act(() =>
      root.render(
        createElement(
          'div',
          null,
          createElement(PersonaBotAvatar, { ...props, surface: 'companion', mouth }),
          createElement(PersonaBotAvatar, props),
        ),
      ),
    );
  const shown = (state: string) =>
    node.querySelector<SVGGElement>(
      '[data-surface="companion"] [data-avatar-mouth="' + state + '"]',
    )?.style.opacity;
  try {
    await render('saved');
    const head = node.querySelector('[data-surface="companion"] .bh-illustrated-head');
    const headStarts = () => animationTargets.filter((target) => target === head).length;
    const starts = headStarts();
    expect(node.querySelector('[data-surface="portrait"] [data-avatar-mouth]')).toBeNull();
    await render('half-open');
    expect(shown('half-open')).toBe('1');
    await render('open');
    expect(shown('open')).toBe('1');
    expect(shown('saved')).toBe('0');
    expect(node.querySelector('[data-surface="companion"] .bh-illustrated-head')).toBe(head);
    expect(headStarts()).toBe(starts);
    await act(async () => {
      document.documentElement.dataset['botharnessMotion'] = 'reduce';
      await Promise.resolve();
    });
    expect(shown('saved')).toBe('1');
    await act(async () => {
      delete document.documentElement.dataset['botharnessMotion'];
      await Promise.resolve();
    });
    expect(shown('open')).toBe('1');
    await render('saved');
    expect(shown('saved')).toBe('1');
  } finally {
    await act(() => root.unmount());
    delete document.documentElement.dataset['botharnessMotion'];
    if (previousAnimate) Object.defineProperty(Element.prototype, 'animate', previousAnimate);
    else Reflect.deleteProperty(Element.prototype, 'animate');
    node.remove();
    vi.unstubAllGlobals();
  }
  expect(cancel).toHaveBeenCalled();
});

it('keeps separate companions neutral across hidden and offscreen mouth updates and releases observers', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const observers: {
    callback(entries: { isIntersecting: boolean }[]): void;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      disconnect = vi.fn();
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        observers.push({ callback, disconnect: this.disconnect });
      }
      observe() {}
    },
  );
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const props = {
    personaBotId: 'ada',
    name: 'Ada',
    size: 96,
    surface: 'companion' as const,
    appearance: { recipe: DEFAULT_ILLUSTRATED_RECIPE, revision: 'a'.repeat(64) },
  };
  const render = (mouth: PixelMouthState, still = false) =>
    act(() =>
      root.render(
        createElement(
          'div',
          null,
          createElement(PersonaBotAvatar, { ...props, mouth, still }),
          createElement(PersonaBotAvatar, { ...props, mouth: 'half-open' }),
        ),
      ),
    );
  const shown = () =>
    [...node.querySelectorAll('[data-avatar-mouth-state]')].map((el) =>
      el.getAttribute('data-avatar-mouth-state'),
    );
  try {
    await render('open');
    expect(shown()).toEqual(['open', 'half-open']);
    await act(() =>
      observers.forEach((observer) => observer.callback([{ isIntersecting: false }])),
    );
    expect(shown()).toEqual(['saved', 'saved']);
    await render('closed');
    expect(shown()).toEqual(['saved', 'saved']);
    await act(() => observers.forEach((observer) => observer.callback([{ isIntersecting: true }])));
    expect(shown()).toEqual(['closed', 'half-open']);
    await act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await render('open');
    expect(shown()).toEqual(['saved', 'saved']);
    await act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(shown()).toEqual(['open', 'half-open']);
    await render('closed', true);
    expect(shown()).toEqual(['saved', 'half-open']);
  } finally {
    await act(() => root.unmount());
    expect(observers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true);
    Reflect.deleteProperty(document, 'hidden');
    vi.unstubAllGlobals();
    node.remove();
  }
});

it('retains unsupported snapshots and non-pixel families without inventing mouth parts', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  const root = createRoot(node);
  const props = {
    personaBotId: 'ada',
    name: 'Ada',
    size: 96,
    surface: 'companion' as const,
    mouth: 'open' as const,
    src: '/snapshot?v=saved',
  };
  try {
    await act(() =>
      root.render(
        createElement(PersonaBotAvatar, {
          ...props,
          appearance: {
            revision: 'b'.repeat(64),
            recipe: {
              family: 'illustrated',
              schemaVersion: 999,
              assetVersion: 999,
              rigVersion: 999,
            },
          },
        }),
      ),
    );
    expect(node.querySelector('img')?.getAttribute('src')).toBe('/snapshot?v=saved');
    expect(node.querySelector('[data-avatar-mouth]')).toBeNull();
    const { DEFAULT_LINE_RECIPE } = await import('../../core/src/bots/avatar-line.js');
    await act(() =>
      root.render(
        createElement(PersonaBotAvatar, {
          ...props,
          appearance: { revision: 'c'.repeat(64), recipe: DEFAULT_LINE_RECIPE },
        }),
      ),
    );
    expect(node.querySelector('svg')).not.toBeNull();
    expect(node.querySelector('[data-avatar-mouth]')).toBeNull();
  } finally {
    await act(() => root.unmount());
  }
});

it('changes the mouth from its retained opacities without computed-style reads or observer churn', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const observers = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor() {
        observers();
      }
      observe() {}
      disconnect() {}
    },
  );
  const fades: { from: unknown; to: unknown }[] = [];
  const previousAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: function (this: Element, frames: Keyframe[]) {
      if (this.hasAttribute('data-avatar-mouth'))
        fades.push({ from: frames[0]?.opacity, to: frames[1]?.opacity });
      return { cancel() {}, finished: new Promise<void>(() => undefined) };
    },
  });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const render = (mouth: PixelMouthState) =>
    act(() =>
      root.render(
        createElement(PersonaBotAvatar, {
          personaBotId: 'ada',
          name: 'Ada',
          size: 96,
          state: 'idle',
          surface: 'companion',
          mouth,
          appearance: { recipe: DEFAULT_ILLUSTRATED_RECIPE, revision: 'a'.repeat(64) },
        }),
      ),
    );
  try {
    await render('saved');
    const created = observers.mock.calls.length;
    const computed = vi.spyOn(window, 'getComputedStyle');
    await render('half-open');
    await render('open');
    await render('saved');
    expect(computed).not.toHaveBeenCalled();
    expect(observers).toHaveBeenCalledTimes(created);
    expect(fades).toContainEqual({ from: '0', to: '1' });
    expect(fades).toContainEqual({ from: '1', to: '0' });
    expect(
      node.querySelector('[data-avatar-mouth-state]')?.getAttribute('data-avatar-mouth-state'),
    ).toBe('saved');
  } finally {
    await act(() => root.unmount());
    if (previousAnimate) Object.defineProperty(Element.prototype, 'animate', previousAnimate);
    else Reflect.deleteProperty(Element.prototype, 'animate');
    Reflect.deleteProperty(document, 'hidden');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    node.remove();
  }
});
