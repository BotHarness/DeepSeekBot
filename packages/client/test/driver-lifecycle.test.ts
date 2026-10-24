// @vitest-environment jsdom
import { driver } from 'driver.js';
import { expect, it, vi } from 'vitest';

it('releases global event handlers across repeated highlights and destruction', () => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  const element = document.createElement('button');
  document.body.append(element);
  const documentAdd = vi.spyOn(document, 'addEventListener');
  const documentRemove = vi.spyOn(document, 'removeEventListener');
  const windowAdd = vi.spyOn(window, 'addEventListener');
  const windowRemove = vi.spyOn(window, 'removeEventListener');
  const types = new Set([
    'pointerdown',
    'mousedown',
    'pointerup',
    'mouseup',
    'click',
    'keydown',
    'keyup',
    'resize',
    'scroll',
  ]);
  try {
    for (let index = 0; index < 3; index++) {
      const tour = driver({ animate: false });
      tour.highlight({ element, popover: { title: 'First' } });
      tour.highlight({ element, popover: { title: 'Second' } });
      tour.destroy();
    }
    for (const [added, removed] of [
      [documentAdd, documentRemove],
      [windowAdd, windowRemove],
    ]) {
      for (const [type, listener] of added!.mock.calls) {
        if (types.has(type))
          expect(
            removed!.mock.calls.some(([name, callback]) => name === type && callback === listener),
            type,
          ).toBe(true);
      }
    }
  } finally {
    element.remove();
    vi.restoreAllMocks();
  }
});
