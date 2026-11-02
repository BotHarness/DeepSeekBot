// @vitest-environment jsdom
import { StrictMode, act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  PersonaBotAvatar,
  PersonaBotFacepile,
  type PersonaBotAvatarProps,
} from '../src/client/avatar.js';
import { IllustratedAvatar } from '../src/client/illustrated-avatar.js';
import { avatarSvg, DEFAULT_ILLUSTRATED_RECIPE } from '../../core/src/bots/avatar-appearance.js';
import { DEFAULT_LINE_RECIPE } from '../../core/src/bots/avatar-line.js';
import { resolvedAvatarRecipe } from '../../core/src/bots/primary-color.js';

it.each([undefined, DEFAULT_ILLUSTRATED_RECIPE, DEFAULT_LINE_RECIPE])(
  'keeps portrait identity and status static without animation resources (%j)',
  async (recipe) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    const intersection = vi.fn();
    const mutation = vi.fn();
    for (const [name, record] of [
      ['IntersectionObserver', intersection],
      ['MutationObserver', mutation],
    ] as const) {
      vi.stubGlobal(
        name,
        class {
          constructor() {
            record();
          }
          observe() {}
          disconnect() {}
        },
      );
    }
    const frames = vi.fn();
    vi.stubGlobal('requestAnimationFrame', frames);
    const animate = vi.fn(() => ({ cancel: vi.fn(), finished: new Promise(() => {}) }));
    const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
    const styles = vi.spyOn(globalThis, 'getComputedStyle');
    const listeners = vi.spyOn(document, 'addEventListener');
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    const props = {
      personaBotId: 'ada',
      name: 'Ada',
      size: 160,
      attention: { approvalCount: 2 },
      ...(recipe ? { appearance: { recipe, revision: 'a'.repeat(64) } } : {}),
    };
    const render = (
      state: 'idle' | 'thinking' | 'working' | 'waiting' | 'blocked',
      overrides: Partial<PersonaBotAvatarProps> = {},
    ) =>
      act(() =>
        root.render(
          createElement(
            StrictMode,
            null,
            createElement(PersonaBotAvatar, { ...props, state, ...overrides }),
          ),
        ),
      );
    try {
      await render('idle');
      const figure = node.querySelector('.bh-avatar-media-composed img');
      const markup = figure?.getAttribute('src');
      expect(figure).not.toBeNull();
      expect(node.querySelector('.bh-avatar-media-composed svg')).toBeNull();
      const expectedRecipe = recipe ?? resolvedAvatarRecipe({ slug: 'ada', displayName: 'Ada' });
      if (expectedRecipe === undefined) throw new Error('Missing seeded portrait recipe');
      expect(markup).toBe(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(expectedRecipe, { surface: 'portrait' }))}`,
      );
      expect(figure?.getAttribute('alt')).toBe('');
      expect(figure?.getAttribute('aria-hidden')).toBe('true');
      const labels = new Set<string | null | undefined>();
      const markers = new Set<string>();
      for (const state of ['thinking', 'working', 'waiting', 'blocked', 'idle'] as const) {
        await render(state);
        expect(node.querySelector('.bh-avatar-media-composed img')).toBe(figure);
        expect(figure?.getAttribute('src')).toBe(markup);
        expect(node.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('Ada');
        expect(node.querySelector('[data-state]')?.getAttribute('data-state')).toBe(state);
        expect(node.querySelector('[data-approval-count="2"]')?.textContent).toBe('2');
        expect(node.querySelector('.botui-dot-matrix')).toBeNull();
        expect(node.querySelector('.bh-avatar-indicator') === null).toBe(state === 'idle');
        labels.add(node.querySelector('[role="img"]')?.getAttribute('aria-label'));
        const marker = node.querySelector('.bh-avatar-indicator svg');
        if (marker) markers.add(marker.innerHTML);
      }
      expect(labels.size).toBe(5);
      expect(markers.size).toBe(4);
      for (const effect of ['searching', 'coding', 'executing'] as const) {
        await render('working', {
          attention: { approvalCount: 3 },
          activity: {
            effect,
            toolKind: 'other',
            toolName: effect,
            startedAt: 0,
            activeToolCount: 1,
          },
        });
        expect(node.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain(effect);
        expect(node.querySelector('[data-approval-count="3"]')?.textContent).toBe('3');
        expect(node.querySelector('.bh-avatar-media-composed img')).toBe(figure);
        expect(figure?.getAttribute('src')).toBe(markup);
      }
      await act(() =>
        root.render(
          createElement(PersonaBotFacepile, {
            items: ['ada', 'bea', 'cy', 'dee'].map((personaBotId) => ({
              ...props,
              personaBotId,
              state: 'working' as const,
            })),
            size: 24,
          }),
        ),
      );
      expect(node.querySelectorAll('.bh-persona-avatar')).toHaveLength(3);
      expect(node.querySelectorAll('.bh-avatar-media-composed img')).toHaveLength(3);
      expect(node.querySelector('.bh-avatar-media-composed svg')).toBeNull();
      expect(node.querySelector('.bh-avatar-facepile-overflow')?.textContent).toBe('+1');
      await act(() => root.unmount());
      expect(animate).not.toHaveBeenCalled();
      expect(intersection).not.toHaveBeenCalled();
      expect(mutation).not.toHaveBeenCalled();
      expect(frames).not.toHaveBeenCalled();
      expect(styles).not.toHaveBeenCalled();
      expect(listeners.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await act(() => root.unmount());
      if (previous) Object.defineProperty(Element.prototype, 'animate', previous);
      else Reflect.deleteProperty(Element.prototype, 'animate');
      node.remove();
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  },
);

it('updates the complete portrait recipe and pose without replacing the image', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const node = document.createElement('div');
  const root = createRoot(node);
  const render = (
    recipe: typeof DEFAULT_ILLUSTRATED_RECIPE | typeof DEFAULT_LINE_RECIPE,
    facing?: 'front' | 'left',
  ) =>
    act(() =>
      root.render(
        createElement(IllustratedAvatar, {
          personaBotId: 'ada',
          recipe,
          facing,
          state: 'idle',
          effect: 'generic-working',
          size: 32,
        }),
      ),
    );
  try {
    await render(DEFAULT_LINE_RECIPE);
    const image = node.querySelector('img');
    expect(image).not.toBeNull();
    const expected = (recipe: typeof DEFAULT_ILLUSTRATED_RECIPE | typeof DEFAULT_LINE_RECIPE) =>
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(recipe, { surface: 'portrait' }))}`;
    expect(image?.getAttribute('src')).toBe(expected(DEFAULT_LINE_RECIPE));
    await render(DEFAULT_ILLUSTRATED_RECIPE);
    expect(node.querySelector('img')).toBe(image);
    expect(image?.getAttribute('src')).toBe(expected(DEFAULT_ILLUSTRATED_RECIPE));
    await render(DEFAULT_ILLUSTRATED_RECIPE, 'left');
    expect(node.querySelector('img')).toBe(image);
    expect(image?.getAttribute('src')).toBe(
      expected({ ...DEFAULT_ILLUSTRATED_RECIPE, pose: 'left' }),
    );
    await render(DEFAULT_ILLUSTRATED_RECIPE, 'front');
    expect(image?.getAttribute('src')).toBe(
      expected({ ...DEFAULT_ILLUSTRATED_RECIPE, pose: 'front' }),
    );
    expect(node.querySelector('svg')).toBeNull();
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('uses the same resource-free path for a still companion and direct portraits', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const observe = vi.fn();
  vi.stubGlobal(
    'MutationObserver',
    class {
      observe = observe;
      disconnect() {}
    },
  );
  const node = document.createElement('div');
  const root = createRoot(node);
  try {
    for (const surface of ['portrait', 'companion'] as const) {
      await act(() =>
        root.render(
          createElement(IllustratedAvatar, {
            personaBotId: 'ada',
            recipe: DEFAULT_ILLUSTRATED_RECIPE,
            state: 'thinking',
            effect: 'coding',
            size: 160,
            surface,
            still: surface === 'companion',
            mouth: 'open',
          }),
        ),
      );
      expect(node.querySelector('[data-avatar-turn]')).toBeNull();
      expect(node.querySelector('[data-avatar-mouth]')).toBeNull();
      expect(node.querySelectorAll('span')).toHaveLength(1);
      expect(node.querySelector('img') !== null).toBe(surface === 'portrait');
      expect(node.querySelector('svg') !== null).toBe(surface === 'companion');
    }
    expect(observe).not.toHaveBeenCalled();
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
