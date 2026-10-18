// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mountPanelScrollbars,
  PANEL_SCROLLBAR_IDLE_MS,
  PANEL_SCROLLBAR_FADE_MS,
} from '../src/client/ds/panel-scrollbars.js';

const property = '--bh-panel-scrollbar-opacity';
let root: HTMLDivElement;
let release: () => void;
function scroller(parent = root) {
  const node = document.createElement('div');
  Object.defineProperties(node, { scrollHeight: { value: 400 }, clientHeight: { value: 100 } });
  parent.append(node);
  return node;
}
const scroll = (node: HTMLElement) => node.dispatchEvent(new Event('scroll'));
const opacity = (node: HTMLElement) => Number(node.style.getPropertyValue(property));
beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement('div');
  document.body.append(root);
  release = mountPanelScrollbars(root);
});
afterEach(() => {
  release();
  root.remove();
  document.documentElement.removeAttribute('data-botharness-motion');
  vi.useRealTimers();
});
describe('Panel scrollbar activity', () => {
  it('shows only the scrolling surface, then fades independently of nested and sibling surfaces', () => {
    const first = scroller();
    const nested = scroller(first);
    const sibling = scroller();
    expect(opacity(first)).toBe(0);
    scroll(first);
    expect(opacity(first)).toBe(1);
    expect(opacity(nested)).toBe(0);
    expect(opacity(sibling)).toBe(0);
    vi.advanceTimersByTime(400);
    scroll(sibling);
    vi.advanceTimersByTime(PANEL_SCROLLBAR_IDLE_MS - 400 + 100);
    expect(opacity(first)).toBeGreaterThan(0);
    expect(opacity(first)).toBeLessThan(1);
    expect(opacity(sibling)).toBe(1);
    vi.advanceTimersByTime(PANEL_SCROLLBAR_FADE_MS);
    expect(opacity(first)).toBe(0);
    expect(opacity(sibling)).toBe(1);
  });
  it('restarts visibility during a fade without stale callbacks concealing the thumb', () => {
    const node = scroller();
    scroll(node);
    vi.advanceTimersByTime(PANEL_SCROLLBAR_IDLE_MS + 100);
    scroll(node);
    expect(opacity(node)).toBe(1);
    vi.advanceTimersByTime(PANEL_SCROLLBAR_IDLE_MS - 1);
    expect(opacity(node)).toBe(1);
    vi.advanceTimersByTime(PANEL_SCROLLBAR_FADE_MS + 32);
    expect(opacity(node)).toBe(0);
  });
  it('cleans up timers and inline state on disposal, and ignores subsequent scrolls', () => {
    const node = scroller();
    scroll(node);
    release();
    expect(root.hasAttribute('data-panel-scrollbars')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(node.style.getPropertyValue(property)).toBe('');
    scroll(node);
    expect(opacity(node)).toBe(0);
  });
  it('hides without animation for reduced motion and drops removed scrollers', () => {
    document.documentElement.dataset['botharnessMotion'] = 'reduce';
    const node = scroller();
    scroll(node);
    vi.advanceTimersByTime(PANEL_SCROLLBAR_IDLE_MS);
    expect(opacity(node)).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    document.documentElement.removeAttribute('data-botharness-motion');
    scroll(node);
    node.remove();
    vi.advanceTimersByTime(PANEL_SCROLLBAR_IDLE_MS + 32);
    expect(opacity(node)).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
