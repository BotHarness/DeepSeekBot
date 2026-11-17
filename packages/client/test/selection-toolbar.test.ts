// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { SelectionToolbar } from '../src/client/ds/selection-toolbar.js';

const WIDTH = 100;

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'getBoundingClientRect');
});

it('keeps the toolbar inside the viewport as its position changes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: 400,
  });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      const left =
        parseFloat(this.style.left || '0') + parseFloat(this.style.marginLeft || '0') - WIDTH / 2;
      return new DOMRect(left, 0, WIDTH, 32);
    },
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = (x: number) =>
    act(async () =>
      root.render(
        createElement(SelectionToolbar, {
          x,
          y: 100,
          below: false,
          label: 'Quote',
          children: null,
        }),
      ),
    );
  const bar = () => document.body.querySelector<HTMLElement>('[data-selection-toolbar]')!;
  const edges = () => {
    const rect = bar().getBoundingClientRect();
    return [rect.left, rect.right];
  };
  await render(395);
  expect(edges()).toEqual([292, 392]);
  await render(200);
  expect(edges()).toEqual([150, 250]);
  await render(5);
  expect(edges()).toEqual([8, 108]);
  await act(async () => root.unmount());
  container.remove();
});
