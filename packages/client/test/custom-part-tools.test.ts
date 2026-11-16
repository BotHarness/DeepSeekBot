// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).dialogPrimitives(),
  IconEditOutlineRegular: () => null,
  IconSaveOutlineRegular: () => null,
  IconCloseOutlineRegular: () => null,
}));
import { CustomPartEditor } from '../src/client/custom-part-editor.js';
import {
  DEFAULT_ILLUSTRATED_RECIPE,
  createCustomPart,
  partLayer,
  withAvatarCustomPart,
  type PixelCustomPart,
} from '../../core/src/bots/avatar-appearance.js';
import { illustratedAvatarSvg } from '../../core/src/bots/avatar-appearance.js';
import { zhTranslate } from '../src/client/locale.js';

function pointer(type: string, init: { alt?: boolean; touch?: number } = {}): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    altKey: init.alt ?? false,
  });
  if (init.touch !== undefined)
    Object.defineProperties(event, {
      pointerType: { value: 'touch' },
      pointerId: { value: init.touch },
    });
  return event;
}

async function mount(initial?: PixelCustomPart) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const change = vi.fn();
  await act(() =>
    root.render(
      createElement(CustomPartEditor, {
        slot: 'headpiece',
        recipe: DEFAULT_ILLUSTRATED_RECIPE,
        initial,
        onChange: change,
        onSave: vi.fn(async () => true),
        onCancel: vi.fn(),
        t: zhTranslate,
      }),
    ),
  );
  const $ = (selector: string) => container.querySelector<HTMLElement>(selector)!;
  const cell = (x: number, y: number) => $(`[data-part-cell="${x},${y}"]`);
  return {
    $,
    change,
    ink: (x: number, y: number) => cell(x, y).getAttribute('data-part-ink'),
    click: (selector: string) => act(() => $(selector).click()),
    down: (x: number, y: number, init?: Parameters<typeof pointer>[1]) =>
      act(() => cell(x, y).dispatchEvent(pointer('pointerdown', init))),
    over: (x: number, y: number, init?: Parameters<typeof pointer>[1]) =>
      act(() => cell(x, y).dispatchEvent(pointer('pointermove', init))),
    up: (init?: Parameters<typeof pointer>[1]) =>
      act(() => $('[data-part-canvas]').dispatchEvent(pointer('pointerup', init))),
    async close() {
      await act(() => root.unmount());
      container.remove();
    },
  };
}

describe('Custom Part drawing tools', () => {
  it('draws mirrored lines and rectangles as one undo step each', async () => {
    const e = await mount();
    try {
      await e.click('[data-part-tool="line"]');
      await e.down(2, 2);
      await e.over(5, 2);
      await e.over(8, 2);
      await e.up();
      for (let x = 2; x <= 8; x++) expect(e.ink(x, 2)).toBe('hairColor:0');
      expect(e.ink(29, 2)).toBe('hairColor:0');
      expect(e.ink(9, 2)).toBeNull();

      await e.click('[data-part-tool="rect"]');
      await e.down(1, 5);
      await e.over(4, 8);
      await e.up();
      expect(e.ink(1, 5)).toBe('hairColor:0');
      expect(e.ink(4, 8)).toBe('hairColor:0');
      expect(e.ink(2, 6)).toBeNull();
      expect(e.ink(27, 8)).toBe('hairColor:0');

      await e.click('[data-part-undo]');
      expect(e.ink(1, 5)).toBeNull();
      expect(e.ink(2, 2)).toBe('hairColor:0');
      await e.click('[data-part-undo]');
      expect(e.ink(2, 2)).toBeNull();
      expect(e.$('[data-part-undo]').hasAttribute('disabled')).toBe(true);
    } finally {
      await e.close();
    }
  });

  it('fills a region with a stepped, dithered tone gradient that recolors with the Avatar', async () => {
    const e = await mount();
    try {
      await e.click('[data-part-tool="gradient"]');
      await e.click('[data-part-gradient-to="-2"]');
      await e.click('[data-part-dither="2"]');
      expect(e.$('[data-part-dither="2"]').getAttribute('aria-pressed')).toBe('true');
      await e.down(0, 0);
      await e.over(15, 0);
      await e.up();
      expect(e.ink(0, 0)).toBe('hairColor:0');
      expect(e.ink(15, 0)).toBe('hairColor:-2');
      expect(e.ink(31, 0)).toBe('hairColor:0');
      expect(e.ink(16, 0)).toBe('hairColor:-2');
      const tones = new Set(Array.from({ length: 16 }, (_, x) => e.ink(x, 0)!.split(':')[1]));
      expect(tones).toEqual(new Set(['0', '-1', '-2']));
      const part = e.change.mock.calls.at(-1)![0] as PixelCustomPart;
      expect(part.front.every(([, , color]) => color === 'hairColor')).toBe(true);
      const red = { ...DEFAULT_ILLUSTRATED_RECIPE, hairColor: '#c0392b' };
      expect(illustratedAvatarSvg(withAvatarCustomPart(red, 'headpiece', part))).not.toBe(
        illustratedAvatarSvg(withAvatarCustomPart(DEFAULT_ILLUSTRATED_RECIPE, 'headpiece', part)),
      );
    } finally {
      await e.close();
    }
  });

  it('adds noise with a re-roll and an amount, and undoes it in one step', async () => {
    const solid = createCustomPart('headpiece', {
      front: partLayer(
        'headpiece',
        Array.from(
          { length: 64 },
          (_, i) => [i % 32, 4 + Math.floor(i / 32), 'shirtColor', 0] as const,
        ),
      ),
      back: partLayer('headpiece', []),
    });
    const e = await mount(solid);
    try {
      await e.click('[data-part-tool="noise"]');
      expect(e.$('[data-part-reroll]').hasAttribute('disabled')).toBe(true);
      await e.down(0, 0);
      const row = () => Array.from({ length: 32 }, (_, x) => e.ink(x, 4));
      const first = row();
      expect(first.some((ink) => ink !== 'shirtColor:0')).toBe(true);
      expect(first.every((ink) => /^shirtColor:(-1|0|1)$/u.test(ink!))).toBe(true);
      expect(e.ink(0, 0)).toBeNull();
      for (let x = 0; x < 16; x++) expect(e.ink(31 - x, 4)).toBe(e.ink(x, 4));
      await e.click('[data-part-reroll]');
      await e.click('[data-part-reroll]');
      expect(row().every((ink) => /^shirtColor:(-1|0|1)$/u.test(ink!))).toBe(true);
      await e.click('[data-part-undo]');
      expect(row().every((ink) => ink === 'shirtColor:0')).toBe(true);
      expect(e.$('[data-part-undo]').hasAttribute('disabled')).toBe(true);
    } finally {
      await e.close();
    }
  });

  it('replaces every cell of one color and tone with the current ink in one step', async () => {
    const two = createCustomPart('headpiece', {
      front: partLayer('headpiece', [
        [1, 1, '#123456', 0],
        [5, 3, '#123456', 0],
        [7, 3, '#654321', 0],
      ]),
      back: partLayer('headpiece', []),
    });
    const e = await mount(two);
    try {
      await e.click('[data-part-tool="replace"]');
      await e.click('button.bh-part-swatch[data-part-ink="hairColor:-1"]');
      await e.down(5, 3);
      await e.up();
      expect(e.ink(1, 1)).toBe('hairColor:-1');
      expect(e.ink(5, 3)).toBe('hairColor:-1');
      expect(e.ink(7, 3)).toBe('#654321:0');
      await e.click('[data-part-undo]');
      expect(e.ink(1, 1)).toBe('#123456:0');
    } finally {
      await e.close();
    }
  });

  it('shades once per stroke, picks colors with Alt-click and the eyedropper', async () => {
    const e = await mount();
    try {
      await e.click('[data-part-ink="#5a7be0:1"]');
      await e.down(3, 3);
      await e.over(4, 3);
      await e.up();
      await e.click('[data-part-shade="darker"]');
      await e.down(3, 3);
      await e.over(4, 3);
      await e.over(3, 3);
      await e.over(3, 4);
      await e.up();
      expect(e.ink(3, 3)).toBe('#5a7be0:0');
      expect(e.ink(4, 3)).toBe('#5a7be0:0');
      expect(e.ink(28, 3)).toBe('#5a7be0:0');
      expect(e.ink(3, 4)).toBeNull();

      await e.click('[data-part-shade="off"]');
      await e.click('[data-part-ink="hairColor:2"]');
      await e.down(3, 3, { alt: true });
      expect(
        e.$('button.bh-part-swatch[data-part-ink="#5a7be0:0"]').getAttribute('aria-pressed'),
      ).toBe('true');
      expect(e.ink(3, 3)).toBe('#5a7be0:0');
      await e.click('[data-part-ink="hairColor:2"]');
      await e.click('[data-part-tool="eyedropper"]');
      await e.down(28, 3);
      expect(
        e.$('button.bh-part-swatch[data-part-ink="#5a7be0:0"]').getAttribute('aria-pressed'),
      ).toBe('true');
      expect(e.$('[data-part-tool="pencil"]').getAttribute('aria-pressed')).toBe('true');
    } finally {
      await e.close();
    }
  });

  it('cancels fill, noise and shapes cleanly on multi-touch and pointercancel', async () => {
    vi.useFakeTimers();
    const e = await mount();
    try {
      await e.down(4, 4, { touch: 1 });
      await e.up({ touch: 1 });
      expect(e.ink(4, 4)).toBe('hairColor:0');
      await e.click('[data-part-tool="fill"]');
      await e.click('button.bh-part-swatch[data-part-ink="#e2565f:0"]');
      await e.down(0, 0, { touch: 2 });
      expect(e.ink(0, 0)).toBe('#e2565f:0');
      await e.down(1, 0, { touch: 3 });
      expect(e.ink(0, 0)).toBeNull();
      await e.up({ touch: 2 });
      await e.up({ touch: 3 });
      expect(e.ink(4, 4)).toBeNull();
      expect(e.ink(0, 0)).toBeNull();

      await e.click('[data-part-tool="line"]');
      await e.down(2, 2);
      await e.over(8, 2);
      await act(() => e.$('[data-part-canvas]').dispatchEvent(pointer('pointercancel')));
      expect(e.ink(2, 2)).toBeNull();
      expect(e.ink(8, 2)).toBeNull();
    } finally {
      vi.useRealTimers();
      await e.close();
    }
  });

  it('re-rolls noise on the layer and mirror it was applied with', async () => {
    const solid = createCustomPart('headpiece', {
      front: partLayer(
        'headpiece',
        Array.from({ length: 32 }, (_, x) => [x, 4, 'shirtColor', 0] as const),
      ),
      back: partLayer('headpiece', [[0, 0, 'shirtColor', 0]]),
    });
    const e = await mount(solid);
    try {
      await e.click('[data-part-tool="noise"]');
      await e.down(0, 0);
      await e.click('[data-part-layer="back"]');
      await e.click('[data-part-reroll]');
      await e.click('[data-part-reroll]');
      const part = e.change.mock.calls.at(-1)![0] as PixelCustomPart;
      expect(part.back).toEqual([[0, 0, 'shirtColor', 0]]);
      expect(part.front.some(([, , , tone]) => tone !== 0)).toBe(true);
    } finally {
      await e.close();
    }
  });

  it('undoes with a two-finger tap, redoes with three, and draws through an offset cursor', async () => {
    vi.useFakeTimers();
    const e = await mount();
    try {
      await e.down(6, 6, { touch: 1 });
      await e.up({ touch: 1 });
      expect(e.ink(6, 6)).toBe('hairColor:0');

      await e.down(10, 10, { touch: 2 });
      await e.down(12, 10, { touch: 3 });
      expect(e.ink(10, 10)).toBeNull();
      await e.up({ touch: 2 });
      await e.up({ touch: 3 });
      expect(e.ink(6, 6)).toBeNull();

      await e.down(1, 1, { touch: 4 });
      await e.down(2, 1, { touch: 5 });
      await e.down(3, 1, { touch: 6 });
      await e.up({ touch: 4 });
      await e.up({ touch: 5 });
      await e.up({ touch: 6 });
      expect(e.ink(6, 6)).toBe('hairColor:0');
      expect(e.ink(1, 1)).toBeNull();

      await e.click('[data-part-ink="#e2565f:0"]');
      await e.down(8, 9, { touch: 7 });
      await act(() => vi.advanceTimersByTime(600));
      await e.up({ touch: 7 });
      expect(e.ink(8, 9)).toBe('#e2565f:0');
      await e.down(6, 6, { touch: 8 });
      await act(() => vi.advanceTimersByTime(600));
      await e.up({ touch: 8 });
      expect(
        e.$('button.bh-part-swatch[data-part-ink="hairColor:0"]').getAttribute('aria-pressed'),
      ).toBe('true');

      await e.click('[data-part-offset]');
      await e.down(9, 9, { touch: 9 });
      expect(e.$('[data-part-cursor]').getAttribute('data-part-cursor')).toBe('9,6');
      expect(e.ink(9, 9)).toBeNull();
      await act(() => {
        e.$('[data-part-offset-draw]').dispatchEvent(pointer('pointerdown'));
      });
      await e.over(10, 9, { touch: 9 });
      await act(() => {
        e.$('[data-part-offset-draw]').dispatchEvent(pointer('pointerup'));
      });
      await e.up({ touch: 9 });
      expect(e.ink(9, 6)).toBe('hairColor:0');
      expect(e.ink(10, 6)).toBe('hairColor:0');
      expect(e.ink(9, 9)).toBeNull();
    } finally {
      vi.useRealTimers();
      await e.close();
    }
  });
});
