// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountZoomTooltips } from '../src/client/window-zoom-tooltips.js';

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute('style');
  vi.restoreAllMocks();
});

describe('qualified desktop tooltip lease', () => {
  it('preserves native position writes and returns all owned presentation on disposal', async () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    const release = mountZoomTooltips(document);
    anchor.focus();
    const tooltip = document.createElement('span');
    tooltip.setAttribute('role', 'tooltip');
    tooltip.dataset.side = 'bottom';
    tooltip.dataset.align = 'center';
    tooltip.style.cssText = 'position:fixed;left:100px;top:90px;max-width:320px';
    Object.defineProperty(tooltip, 'currentCSSZoom', { value: 2 });
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(new DOMRect(80, 50, 40, 32));
    vi.spyOn(tooltip, 'getBoundingClientRect').mockImplementation(() => {
      const [x = 0, y = 0] = tooltip.style.translate
        .split(' ')
        .map((value) => Number.parseFloat(value) || 0);
      return new DOMRect(150 + x * 2, 180 + y * 2, 100, 40);
    });
    document.body.append(tooltip);
    await vi.waitFor(() => expect(tooltip.style.translate).not.toBe(''));
    expect(tooltip.style.left).toBe('100px');
    expect(tooltip.style.top).toBe('90px');
    expect(tooltip.getBoundingClientRect().left).toBeCloseTo(50);
    expect(tooltip.getBoundingClientRect().top).toBeCloseTo(90);
    release();
    expect(tooltip.style.translate).toBe('');
    expect(tooltip.style.maxWidth).toBe('320px');
    tooltip.style.left = '200px';
    await new Promise((done) => setTimeout(done, 0));
    expect(tooltip.style.translate).toBe('');
  });

  it('leaves non-native and already translated surfaces with their owner', async () => {
    const release = mountZoomTooltips(document);
    const tooltip = document.createElement('span');
    tooltip.setAttribute('role', 'tooltip');
    tooltip.dataset.side = 'right';
    tooltip.dataset.align = 'center';
    tooltip.style.cssText = 'position:fixed;left:100px;top:90px;translate:2px 3px';
    document.body.append(tooltip);
    await new Promise((done) => setTimeout(done, 0));
    expect(tooltip.style.translate).toBe('2px 3px');
    expect(tooltip.style.maxWidth).toBe('');
    release();
    expect(tooltip.style.translate).toBe('2px 3px');
  });

  it('returns a flipped tooltip to its native side on disposal', async () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(80, window.innerHeight - 40, 40, 32),
    );
    const release = mountZoomTooltips(document);
    anchor.focus();
    const tooltip = document.createElement('span');
    tooltip.setAttribute('role', 'tooltip');
    tooltip.dataset.side = 'bottom';
    tooltip.dataset.align = 'center';
    tooltip.style.cssText = `position:fixed;left:100px;top:${window.innerHeight}px;max-width:320px`;
    vi.spyOn(tooltip, 'getBoundingClientRect').mockImplementation(() => {
      const [x = 0, y = 0] = tooltip.style.translate
        .split(' ')
        .map((value) => Number.parseFloat(value) || 0);
      return new DOMRect(50 + x, window.innerHeight + y, 100, 40);
    });
    document.body.append(tooltip);
    await vi.waitFor(() => expect(tooltip.dataset.side).toBe('top'));
    release();
    expect(tooltip.dataset.side).toBe('bottom');
    expect(tooltip.style.translate).toBe('');
    expect(tooltip.style.maxWidth).toBe('320px');
    expect(tooltip.style.top).toBe(`${window.innerHeight}px`);
    await new Promise((done) => setTimeout(done, 0));
    expect(tooltip.dataset.side).toBe('bottom');
  });
});
