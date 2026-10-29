// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { createDockview, type DockviewApi } from 'dockview-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let api: DockviewApi | undefined;
let host: HTMLDivElement;
let zoom: number;
const commonJsFactory: typeof createDockview = createRequire(import.meta.url)(
  'dockview-react',
).createDockview;

beforeEach(() => {
  zoom = 1;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  Object.defineProperty(HTMLElement.prototype, 'currentCSSZoom', {
    configurable: true,
    get: () => zoom,
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.classList.contains('dv-content-container'))
      return new DOMRect(308 * zoom, 40 * zoom, 600 * zoom, 500 * zoom);
    return new DOMRect(8 * zoom, 10 * zoom, 1000 * zoom, 700 * zoom);
  });
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  api?.dispose();
  host.remove();
  document.documentElement.style.zoom = '';
  Reflect.deleteProperty(HTMLElement.prototype, 'currentCSSZoom');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.each([
  ['ESM', createDockview],
  ['CommonJS', commonJsFactory],
] as const)('pinned Dockview %s zoom geometry', (_name, create) => {
  beforeEach(() => {
    api = create(host, {
      defaultRenderer: 'always',
      createComponent: () => ({ element: document.createElement('input'), init() {} }),
    });
  });
  it.each([1, 1 / 1.2, 1.2, 1.2 ** -8, 1.2 ** 8])(
    'converts viewport rectangles to local layout units at zoom %s',
    async (factor) => {
      zoom = factor;
      document.documentElement.style.zoom = String(factor);
      const panel = api!.addPanel({ id: 'home', component: 'input' });
      const input = panel.view.content.element;
      input.setAttribute('value', 'retained');
      api!.layout(1000, 700, true);
      await new Promise((done) => setTimeout(done, 20));
      const overlay = input.parentElement!;
      for (const [key, expected] of Object.entries({ left: 300, top: 30, width: 600, height: 500 }))
        expect(parseFloat(overlay.style.getPropertyValue(key))).toBeCloseTo(expected, 2);
      expect(panel.view.content.element).toBe(input);
      expect(input.getAttribute('value')).toBe('retained');
    },
  );
});
