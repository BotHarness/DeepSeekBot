// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PersonaBotAvatar } from '../src/client/avatar.js';
import {
  DEFAULT_ILLUSTRATED_RECIPE,
  LINE_TOOL_SYMBOLS,
  pixelSymbolCells,
} from '../../core/src/bots/avatar-appearance.js';
import { lineMorphD, sampleLineSymbol } from '../src/client/line-morph.js';
import { PIXEL_MORPH_MS, PIXEL_SYMBOL_HOLD_MS } from '../src/client/illustrated-avatar.js';
import { pixelPathMarkup as rawPixelMarkup } from '@botharness/pixel-morph';

const pixelMarkup = (...args: Parameters<typeof rawPixelMarkup>) => {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.innerHTML = rawPixelMarkup(...args);
  return group.innerHTML;
};
import { DEFAULT_LINE_RECIPE } from '../../core/src/bots/avatar-line.js';

it('renders the same pixel recipe as a transparent companion while retaining the portrait tile', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  const root = createRoot(node);
  const props = {
    personaBotId: 'ada',
    name: 'Ada',
    size: 96,
    appearance: { recipe: DEFAULT_ILLUSTRATED_RECIPE, revision: 'a'.repeat(64) },
  };
  try {
    await act(() => root.render(createElement(PersonaBotAvatar, props)));
    expect(node.querySelector('svg > rect[width="32"]')).not.toBeNull();
    const head = node.querySelector('.bh-illustrated-head')!.innerHTML;
    await act(() =>
      root.render(createElement(PersonaBotAvatar, { ...props, surface: 'companion' })),
    );
    expect(node.querySelector('svg > rect[width="32"]')).toBeNull();
    const restored = node.querySelector('.bh-illustrated-head')!.cloneNode(true);
    if (!(restored instanceof Element)) throw new Error('Missing companion head');
    for (const layer of restored.querySelectorAll('[data-avatar-mouth]')) {
      if (layer.getAttribute('data-avatar-mouth') === 'saved')
        layer.replaceWith(...layer.childNodes);
      else layer.remove();
    }
    expect(restored.innerHTML).toBe(head);
    expect(node.querySelector('[data-surface="companion"]')).not.toBeNull();
  } finally {
    await act(() => root.unmount());
  }
});

it('keeps same-Bot SVG instances independent and releases mounted animation resources', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const containers = [document.createElement('div'), document.createElement('div')];
  containers.forEach((node) => document.body.append(node));
  const roots = containers.map((node) => createRoot(node));
  const animations: { cancel: ReturnType<typeof vi.fn>; target: Element }[] = [];
  const animate = vi.fn(function (this: Element) {
    const animation = {
      cancel: vi.fn(),
      target: this,
      finished: new Promise<void>(() => undefined),
    };
    animations.push(animation);
    return animation;
  });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect = vi.fn();
    },
  );
  const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const props = {
    personaBotId: 'ada',
    name: 'Ada',
    size: 160,
    state: 'working' as const,
    effect: 'coding' as const,
    appearance: { recipe: DEFAULT_ILLUSTRATED_RECIPE, revision: 'a'.repeat(64) },
    attention: { approvalCount: 1 },
  };
  try {
    await act(() => roots.forEach((root) => root.render(createElement(PersonaBotAvatar, props))));
    expect(animations).toHaveLength(4);
    expect(animations[0]!.target).not.toBe(animations[2]!.target);
    expect(containers[0]!.querySelector('svg')!.innerHTML).toBe(
      containers[1]!.querySelector('svg')!.innerHTML,
    );
    expect(containers.every((node) => node.querySelector('[id]') === null)).toBe(true);
    await act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(animations.every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true);
    await act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(animate).toHaveBeenCalledTimes(8);
    await act(() => {
      document.documentElement.dataset['botharnessMotion'] = 'reduce';
    });
    expect(animations.every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true);
    expect(
      containers.every((node) => node.querySelector('[data-approval-count="1"]') !== null),
    ).toBe(true);
    await act(() => roots.forEach((root) => root.unmount()));
    expect(animate).toHaveBeenCalledTimes(8);
  } finally {
    await act(() => roots.forEach((root) => root.unmount()));
    if (previous) Object.defineProperty(Element.prototype, 'animate', previous);
    else Reflect.deleteProperty(Element.prototype, 'animate');
    Reflect.deleteProperty(document, 'hidden');
    delete document.documentElement.dataset['botharnessMotion'];
    vi.unstubAllGlobals();
    containers.forEach((node) => node.remove());
  }
});

it('keeps an idle small avatar still while the large avatar only blinks', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const loops: Element[] = [];
  const animate = vi.fn(function (
    this: Element,
    _frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    if (options.iterations === Infinity) loops.push(this);
    return { cancel: vi.fn(), finished: Promise.resolve() };
  });
  const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const props = {
    personaBotId: 'ada',
    name: 'Ada',
    state: 'idle' as const,
    appearance: { recipe: DEFAULT_ILLUSTRATED_RECIPE, revision: 'a'.repeat(64) },
  };
  try {
    await act(async () => root.render(createElement(PersonaBotAvatar, { ...props, size: 34 })));
    expect(loops).toHaveLength(0);
    await act(async () => root.render(createElement(PersonaBotAvatar, { ...props, size: 160 })));
    expect(loops.map((loop) => loop.getAttribute('class'))).toEqual([
      'bh-illustrated-gaze',
      'bh-illustrated-blink',
    ]);
  } finally {
    await act(() => root.unmount());
    if (previous) Object.defineProperty(Element.prototype, 'animate', previous);
    else Reflect.deleteProperty(Element.prototype, 'animate');
    Reflect.deleteProperty(document, 'hidden');
    node.remove();
  }
});

it('loops the gaze only on the large working avatar and keeps waiting avatars still', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const loops: { target: Element; frames: Keyframe[] }[] = [];
  const animate = vi.fn(function (
    this: Element,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    if (options.iterations === Infinity) loops.push({ target: this, frames });
    return { cancel: vi.fn(), finished: Promise.resolve() };
  });
  const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const props = {
    personaBotId: 'ada',
    name: 'Ada',
    appearance: { recipe: DEFAULT_ILLUSTRATED_RECIPE, revision: 'a'.repeat(64) },
  };
  const classes = () => loops.map((loop) => loop.target.getAttribute('class'));
  try {
    await act(async () =>
      root.render(
        createElement(PersonaBotAvatar, {
          ...props,
          size: 34,
          state: 'working',
          effect: 'searching',
        }),
      ),
    );
    expect(classes()).toEqual(['bh-illustrated-head']);
    const covered = () => node.querySelector('svg')!.hasAttribute('data-pixel-cover');
    const icon = () => node.querySelector('[data-avatar-pixel-morph]')!.innerHTML;
    expect(covered()).toBe(true);
    expect(icon()).toBe(
      pixelMarkup(pixelSymbolCells('search', DEFAULT_ILLUSTRATED_RECIPE.hairColor)),
    );
    const searching = icon();
    loops.length = 0;
    await act(async () =>
      root.render(
        createElement(PersonaBotAvatar, {
          ...props,
          size: 160,
          state: 'working',
          effect: 'searching',
        }),
      ),
    );
    expect(classes()).toEqual([
      'bh-illustrated-head',
      'bh-illustrated-gaze',
      'bh-illustrated-blink',
    ]);
    expect(icon()).toBe(searching);
    const gaze = loops[1]!.frames.map((frame) => String(frame.transform));
    expect(gaze).toContain('translate(-1px, 0px)');
    expect(gaze).toContain('translate(1px, 0px)');
    expect(loops[1]!.frames.every((frame) => frame.easing === 'steps(1, end)')).toBe(true);
    expect(loops[2]!.frames.some((frame) => frame.opacity === 1)).toBe(true);
    loops.length = 0;
    await act(async () =>
      root.render(createElement(PersonaBotAvatar, { ...props, size: 160, state: 'waiting' })),
    );
    expect(loops).toHaveLength(0);
  } finally {
    await act(() => root.unmount());
    if (previous) Object.defineProperty(Element.prototype, 'animate', previous);
    else Reflect.deleteProperty(Element.prototype, 'animate');
    Reflect.deleteProperty(document, 'hidden');
    node.remove();
  }
});

it('turns the large thinking avatar through noise-scheduled yaw frames and keeps small avatars on head steps', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const loops: { target: Element; frames: Keyframe[] }[] = [];
  const animate = vi.fn(function (
    this: Element,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    if (options.iterations === Infinity) loops.push({ target: this, frames });
    return { cancel: vi.fn(), finished: Promise.resolve() };
  });
  const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const props = {
    personaBotId: 'ada',
    name: 'Ada',
    state: 'thinking' as const,
    appearance: { recipe: DEFAULT_ILLUSTRATED_RECIPE, revision: 'a'.repeat(64) },
  };
  try {
    await act(async () => root.render(createElement(PersonaBotAvatar, { ...props, size: 160 })));
    const turns = loops.filter((loop) => loop.target.hasAttribute('data-avatar-turn'));
    expect(turns).toHaveLength(4);
    const shown = (index: number) =>
      [
        ...loops.filter((loop) =>
          ['bh-illustrated-head'].includes(loop.target.getAttribute('class') ?? ''),
        ),
        ...turns,
      ].filter((loop) => loop.frames[index]?.opacity === 1).length;
    for (let index = 0; index < 40; index++) expect(shown(index)).toBe(1);
    expect(new Set(turns.flatMap((loop) => loop.frames.map((frame) => frame.opacity))).size).toBe(
      2,
    );
    loops.length = 0;
    await act(async () => root.render(createElement(PersonaBotAvatar, { ...props, size: 34 })));
    expect(node.querySelector('[data-avatar-turn]')).toBeNull();
    expect(loops.map((loop) => loop.target.getAttribute('class'))).toEqual(['bh-illustrated-head']);
  } finally {
    await act(() => root.unmount());
    if (previous) Object.defineProperty(Element.prototype, 'animate', previous);
    else Reflect.deleteProperty(Element.prototype, 'animate');
    Reflect.deleteProperty(document, 'hidden');
    node.remove();
  }
});

it('morphs line strokes into tool symbols, holds each briefly, returns to the face and snaps under reduced motion', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const animate = vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve() }));
  const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  let now = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const flush = async (count: number) => {
    for (let i = 0; i < count && frames.size; i++) {
      now += 16;
      const due = [...frames.values()];
      frames.clear();
      for (const callback of due) callback(now);
      await act(async () => undefined);
    }
  };
  const render = (state: 'working' | 'idle', toolName?: string) =>
    act(async () =>
      root.render(
        createElement(PersonaBotAvatar, {
          personaBotId: 'ada',
          name: 'Ada',
          appearance: { recipe: DEFAULT_LINE_RECIPE, revision: 'a'.repeat(64) },
          size: 160,
          state,
          ...(toolName
            ? {
                activity: {
                  effect: 'generic-working' as const,
                  toolKind: 'other' as const,
                  toolName,
                  startedAt: 0,
                  activeToolCount: 1,
                },
              }
            : {}),
        }),
      ),
    );
  const symbolD = (key: keyof typeof LINE_TOOL_SYMBOLS) =>
    lineMorphD(sampleLineSymbol(LINE_TOOL_SYMBOLS[key], 1));
  const path = () => node.querySelector<SVGPathElement>('path[data-avatar-transition]')!;
  const head = () => node.querySelector<SVGGElement>('.bh-illustrated-head')!;
  try {
    await render('working', 'edit');
    expect(frames.size).toBe(0);
    expect(path().getAttribute('d')).toBe(symbolD('edit'));
    expect(path().style.opacity).toBe('1');
    expect(head().style.opacity).toBe('0');
    await render('working', 'bash');
    expect(frames.size).toBe(0);
    await act(() => new Promise((resolve) => setTimeout(resolve, PIXEL_SYMBOL_HOLD_MS + 40)));
    expect(frames.size).toBe(1);
    await flush(4);
    const mid = path().getAttribute('d');
    expect(mid).not.toBe(symbolD('edit'));
    expect(mid).not.toBe(symbolD('bash'));
    await render('working', 'grep');
    expect(node.querySelectorAll('[data-avatar-transition]')).toHaveLength(1);
    expect(frames.size).toBe(1);
    expect(path().getAttribute('d')).toBe(mid);
    await flush(240);
    expect(frames.size).toBe(0);
    expect(path().getAttribute('d')).not.toBe(mid);
    expect(head().style.opacity).toBe('0');

    await render('idle');
    await act(() => new Promise((resolve) => setTimeout(resolve, PIXEL_SYMBOL_HOLD_MS + 40)));
    await flush(240);
    expect(frames.size).toBe(0);
    expect(path().style.opacity).toBe('0');
    expect(head().style.opacity).toBe('1');
    document.documentElement.dataset['botharnessMotion'] = 'reduce';
    await render('working', 'ask_user_question');
    expect(frames.size).toBe(0);
    expect(path().getAttribute('d')).toBe(symbolD('ask'));
    expect(path().style.opacity).toBe('1');
    await render('idle');
    expect(frames.size).toBe(0);
    expect(path().style.opacity).toBe('0');
    expect(head().style.opacity).toBe('');
  } finally {
    delete document.documentElement.dataset['botharnessMotion'];
    delete document.documentElement.dataset['botharnessActivity'];
    await act(() => root.unmount());
    vi.unstubAllGlobals();
    if (previous) Object.defineProperty(Element.prototype, 'animate', previous);
    else Reflect.deleteProperty(Element.prototype, 'animate');
    Reflect.deleteProperty(document, 'hidden');
    node.remove();
  }
});

it('morphs the whole pixel Avatar between tool symbols, holds each briefly and snaps under reduced motion', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const animate = vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve() }));
  const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  let now = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const flush = async (count: number) => {
    for (let i = 0; i < count && frames.size; i++) {
      now += 16;
      const due = [...frames.values()];
      frames.clear();
      for (const callback of due) callback(now);
      await act(async () => undefined);
    }
  };
  const render = (state: 'working' | 'idle', toolName?: string) =>
    act(async () =>
      root.render(
        createElement(PersonaBotAvatar, {
          personaBotId: 'ada',
          name: 'Ada',
          appearance: { recipe: DEFAULT_ILLUSTRATED_RECIPE, revision: 'a'.repeat(64) },
          size: 160,
          state,
          ...(toolName
            ? {
                activity: {
                  effect: 'generic-working' as const,
                  toolKind: 'other' as const,
                  toolName,
                  startedAt: 0,
                  activeToolCount: 1,
                },
              }
            : {}),
        }),
      ),
    );
  const hair = DEFAULT_ILLUSTRATED_RECIPE.hairColor;
  const drawn = () => node.querySelector('[data-avatar-pixel-morph]')!.innerHTML;
  const covered = () => node.querySelector('svg')!.hasAttribute('data-pixel-cover');
  try {
    await render('working', 'edit');
    expect(frames.size).toBe(0);
    expect(covered()).toBe(true);
    expect(drawn()).toBe(pixelMarkup(pixelSymbolCells('edit', hair)));
    await render('working', 'bash');
    expect(frames.size).toBe(0);
    await act(() => new Promise((resolve) => setTimeout(resolve, PIXEL_SYMBOL_HOLD_MS + 40)));
    expect(frames.size).toBe(1);
    await flush(6);
    const mid = drawn();
    expect(mid).not.toBe(pixelMarkup(pixelSymbolCells('edit', hair)));
    expect(mid).not.toBe(pixelMarkup(pixelSymbolCells('bash', hair)));
    await render('working', 'grep');
    expect(frames.size).toBe(1);
    expect(drawn()).toBe(mid);
    await flush(Math.ceil(PIXEL_MORPH_MS / 16) + 2);
    expect(frames.size).toBe(0);
    expect(drawn()).toBe(pixelMarkup(pixelSymbolCells('search', hair)));
    document.documentElement.dataset['botharnessActivity'] = 'stale';
    await render('working', 'edit');
    expect(frames.size).toBe(0);
    expect(drawn()).toBe(pixelMarkup(pixelSymbolCells('edit', hair)));
    delete document.documentElement.dataset['botharnessActivity'];
    await act(async () => undefined);
    document.documentElement.dataset['botharnessMotion'] = 'reduce';
    await render('working', 'ask_user_question');
    expect(frames.size).toBe(0);
    expect(drawn()).toBe(pixelMarkup(pixelSymbolCells('ask', hair)));
    await render('idle');
    expect(frames.size).toBe(0);
    expect(covered()).toBe(false);
    expect(drawn()).toBe('');
  } finally {
    delete document.documentElement.dataset['botharnessMotion'];
    delete document.documentElement.dataset['botharnessActivity'];
    await act(() => root.unmount());
    vi.unstubAllGlobals();
    if (previous) Object.defineProperty(Element.prototype, 'animate', previous);
    else Reflect.deleteProperty(Element.prototype, 'animate');
    Reflect.deleteProperty(document, 'hidden');
    node.remove();
  }
});

it('keeps an Avatar scrolled out of view still across updates and resumes motion when it returns', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const animate = vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve() }));
  const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const observers: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  const scroll = (isIntersecting: boolean) =>
    act(async () => observers.at(-1)!([{ isIntersecting }]));
  const render = (toolName: string) =>
    act(async () =>
      root.render(
        createElement(PersonaBotAvatar, {
          personaBotId: 'ada',
          name: 'Ada',
          appearance: { recipe: DEFAULT_ILLUSTRATED_RECIPE, revision: 'a'.repeat(64) },
          size: 40,
          state: 'working',
          activity: {
            effect: 'generic-working' as const,
            toolKind: 'other' as const,
            toolName,
            startedAt: 0,
            activeToolCount: 1,
          },
        }),
      ),
    );
  const hair = DEFAULT_ILLUSTRATED_RECIPE.hairColor;
  const drawn = () => node.querySelector('[data-avatar-pixel-morph]')!.innerHTML;
  try {
    await render('edit');
    await scroll(false);
    animate.mockClear();
    await render('bash');
    await render('grep');
    await act(() => new Promise((resolve) => setTimeout(resolve, PIXEL_SYMBOL_HOLD_MS + 40)));
    expect(frames.size).toBe(0);
    expect(animate).not.toHaveBeenCalled();
    expect(drawn()).toBe(pixelMarkup(pixelSymbolCells('search', hair)));
    await scroll(true);
    expect(animate).toHaveBeenCalled();
    await render('edit');
    await act(() => new Promise((resolve) => setTimeout(resolve, PIXEL_SYMBOL_HOLD_MS + 40)));
    expect(frames.size).toBe(1);
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
    if (previous) Object.defineProperty(Element.prototype, 'animate', previous);
    else Reflect.deleteProperty(Element.prototype, 'animate');
    Reflect.deleteProperty(document, 'hidden');
    node.remove();
  }
});

it('keeps archived companions still while retaining truthful outer labels and unknown-version image snapshots', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const animate = vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve() }));
  const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  const node = document.createElement('div');
  const root = createRoot(node);
  const props = {
    personaBotId: 'ada',
    name: 'Ada',
    size: 96,
    surface: 'companion' as const,
    appearance: { recipe: DEFAULT_ILLUSTRATED_RECIPE, revision: 'a'.repeat(64) },
    state: 'idle' as const,
    still: true,
  };
  try {
    await act(() => root.render(createElement(PersonaBotAvatar, props)));
    expect(animate).not.toHaveBeenCalled();
    await act(() =>
      root.render(
        createElement(PersonaBotAvatar, {
          ...props,
          src: '/snapshot?v=revision',
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
    expect(node.querySelector('img')?.getAttribute('src')).toBe('/snapshot?v=revision');
    expect(node.querySelector('svg')).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  } finally {
    await act(() => root.unmount());
    if (previous) Object.defineProperty(Element.prototype, 'animate', previous);
    else Reflect.deleteProperty(Element.prototype, 'animate');
  }
});

it('fences resolved obsolete animations when motion policy changes before their completion', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const jobs: { resolve(): void; cancel: ReturnType<typeof vi.fn>; looping: boolean }[] = [];
  const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: (_frames: Keyframe[], options: KeyframeAnimationOptions) => {
      let resolve = () => {};
      const finished = new Promise<void>((done) => {
        resolve = done;
      });
      const job = { resolve, cancel: vi.fn(), looping: options.iterations === Infinity };
      jobs.push(job);
      return { finished, cancel: job.cancel };
    },
  });
  const node = document.createElement('div');
  const root = createRoot(node);
  try {
    await act(() =>
      root.render(
        createElement(PersonaBotAvatar, {
          personaBotId: 'ada',
          name: 'Ada',
          size: 96,
          appearance: { recipe: DEFAULT_ILLUSTRATED_RECIPE, revision: 'a'.repeat(64) },
        }),
      ),
    );
    expect(jobs).toHaveLength(2);
    await act(() => {
      document.documentElement.dataset['botharnessMotion'] = 'reduce';
    });
    await act(() => {
      document.documentElement.dataset['botharnessMotion'] = 'full';
    });
    expect(jobs).toHaveLength(4);
    await act(async () => {
      jobs[0]!.resolve();
      jobs[1]!.resolve();
    });
    expect(jobs.some((job) => job.looping)).toBe(false);
    await act(async () => {
      jobs[2]!.resolve();
      jobs[3]!.resolve();
    });
    expect(jobs.filter((job) => job.looping)).toHaveLength(2);
    await act(() => root.unmount());
    expect(
      jobs.filter((job) => job.looping).every((job) => job.cancel.mock.calls.length === 1),
    ).toBe(true);
  } finally {
    await act(() => root.unmount());
    delete document.documentElement.dataset['botharnessMotion'];
    if (previous) Object.defineProperty(Element.prototype, 'animate', previous);
    else Reflect.deleteProperty(Element.prototype, 'animate');
  }
});

it('keeps one parsed figure while a large avatar alternates thinking and working, and drops turn layers when idle', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const loops: Element[] = [];
  const animate = vi.fn(function (
    this: Element,
    _frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    if (options.iterations === Infinity) loops.push(this);
    return { cancel: vi.fn(), finished: Promise.resolve() };
  });
  const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const render = (state: 'thinking' | 'working' | 'idle') =>
    act(async () =>
      root.render(
        createElement(PersonaBotAvatar, {
          personaBotId: 'ada',
          name: 'Ada',
          size: 96,
          state,
          surface: 'companion',
          appearance: { recipe: DEFAULT_ILLUSTRATED_RECIPE, revision: 'a'.repeat(64) },
        }),
      ),
    );
  try {
    await render('thinking');
    const figure = node.querySelector('svg');
    expect(loops.filter((target) => target.hasAttribute('data-avatar-turn'))).toHaveLength(4);
    loops.length = 0;
    await render('working');
    expect(node.querySelector('svg')).toBe(figure);
    expect(loops.some((target) => target.hasAttribute('data-avatar-turn'))).toBe(false);
    expect(loops.map((target) => target.getAttribute('class'))).toContain('bh-illustrated-head');
    await render('thinking');
    expect(node.querySelector('svg')).toBe(figure);
    await render('idle');
    expect(node.querySelector('[data-avatar-turn]')).toBeNull();
  } finally {
    await act(() => root.unmount());
    if (previous) Object.defineProperty(Element.prototype, 'animate', previous);
    else Reflect.deleteProperty(Element.prototype, 'animate');
    Reflect.deleteProperty(document, 'hidden');
    node.remove();
  }
});
