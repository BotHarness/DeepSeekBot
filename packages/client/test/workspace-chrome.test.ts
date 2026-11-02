// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWorkspaceChrome, updateWorkspaceChrome } from '../src/client/workspace-chrome.js';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('[data-chrome-test]')?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture(zoom: number) {
  document.body.innerHTML = `<div data-workspace-enabled><div class="bh-workspace-chrome"></div><div class="bh-dock"><div id="group"></div></div></div>`;
  const root = document.querySelector<HTMLElement>('[data-workspace-enabled]')!;
  const chrome = root.querySelector<HTMLElement>('.bh-workspace-chrome')!;
  const group = document.getElementById('group')!;
  Object.defineProperty(root, 'currentCSSZoom', { configurable: true, get: () => zoom });
  vi.spyOn(chrome, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 88, 40));
  vi.spyOn(group, 'getBoundingClientRect').mockReturnValue(new DOMRect(60, 4, 250, 500));
  const groups = [{ element: group, panels: [{ id: 'bh:channels' }] }];
  return { root, chrome, group, groups };
}

describe('workspace native corner coordinates', () => {
  it.each([1 / 1.2, 1, 1.44, 1.2 ** -8, 1.2 ** 8])(
    'converts the actual protected footprint into header CSS units at %s',
    (zoom) => {
      const { root, group, groups } = fixture(zoom);
      updateWorkspaceChrome(root, groups);
      expect(root.style.getPropertyValue('--bh-workspace-zoom')).toBe(String(zoom));
      expect(parseFloat(group.style.getPropertyValue('--bh-mac-leading')) * zoom).toBeCloseTo(28);
      expect(group.hasAttribute('data-bh-mac-corner')).toBe(true);
      expect(group.hasAttribute('data-bh-rail-corner')).toBe(false);
    },
  );

  it('only reserves groups whose rectangles intersect the native corner and clears stale markers', () => {
    const { root, group, groups } = fixture(1);
    groups[0]!.panels[0]!.id = 'bh:workspace-rail';
    updateWorkspaceChrome(root, groups);
    expect(group.hasAttribute('data-bh-rail-corner')).toBe(true);
    vi.mocked(group.getBoundingClientRect).mockReturnValue(new DOMRect(100, 4, 250, 500));
    updateWorkspaceChrome(root, groups);
    expect(group.hasAttribute('data-bh-mac-corner')).toBe(false);
    vi.mocked(group.getBoundingClientRect).mockReturnValue(new DOMRect(0, 60, 250, 500));
    updateWorkspaceChrome(root, groups);
    expect(group.hasAttribute('data-bh-mac-corner')).toBe(false);
    vi.mocked(group.getBoundingClientRect).mockReturnValue(new DOMRect(4, 4, 250, 500));
    updateWorkspaceChrome(root, groups);
    expect(group.hasAttribute('data-bh-mac-corner')).toBe(true);
    const chrome = root.querySelector<HTMLElement>('.bh-workspace-chrome')!;
    vi.mocked(chrome.getBoundingClientRect).mockReturnValue(new DOMRect());
    updateWorkspaceChrome(root, groups);
    expect(group.hasAttribute('data-bh-mac-corner')).toBe(false);
    expect(group.hasAttribute('data-bh-rail-corner')).toBe(false);
  });

  it('tracks zoom/fullscreen and workspace resizing without persisting a layout or leaking observers', async () => {
    const { root, group, groups } = fixture(1);
    const resize = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize.mockImplementation(callback);
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const release = mountWorkspaceChrome(root, () => groups);
    vi.mocked(group.getBoundingClientRect).mockReturnValue(new DOMRect(100, 4, 250, 500));
    resize();
    expect(group.hasAttribute('data-bh-mac-corner')).toBe(false);
    vi.mocked(group.getBoundingClientRect).mockReturnValue(new DOMRect(60, 4, 250, 500));
    resize();
    expect(group.hasAttribute('data-bh-mac-corner')).toBe(true);
    vi.mocked(group.getBoundingClientRect).mockReturnValue(new DOMRect(100, 4, 250, 500));
    document.documentElement.setAttribute('style', 'zoom:1.2');
    await new Promise((done) => setTimeout(done, 0));
    expect(group.hasAttribute('data-bh-mac-corner')).toBe(false);
    release();
    expect(disconnect).toHaveBeenCalledOnce();
    vi.mocked(group.getBoundingClientRect).mockReturnValue(new DOMRect(0, 4, 250, 500));
    document.documentElement.setAttribute('style', 'zoom:1');
    await new Promise((done) => setTimeout(done, 0));
    expect(group.hasAttribute('data-bh-mac-corner')).toBe(false);
    document.documentElement.removeAttribute('style');
  });

  it('falls back to effective ancestor zoom when the native CSS zoom measurement is invalid', () => {
    const { root, group, groups } = fixture(1);
    Object.defineProperty(root, 'currentCSSZoom', { value: NaN });
    const original = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const style = original(element);
      Object.defineProperty(style, 'zoom', {
        value: element === root ? '2' : element === document.body ? '1.2' : '1',
      });
      return style;
    });
    updateWorkspaceChrome(root, groups);
    expect(Number(root.style.getPropertyValue('--bh-workspace-zoom'))).toBeCloseTo(2.4);
    expect(parseFloat(group.style.getPropertyValue('--bh-mac-leading')) * 2.4).toBeCloseTo(28);
  });
});
