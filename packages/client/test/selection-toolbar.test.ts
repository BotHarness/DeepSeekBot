// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { SelectionToolbar } from '../src/client/ds/selection-toolbar.js';
import { useSelectionQuote } from '../src/client/selection-quote.js';

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

it('moves a visible toolbar back inside the viewport when the window narrows', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const width = (value: number) =>
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value });
  width(400);
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      const left =
        parseFloat(this.style.left || '0') + parseFloat(this.style.marginLeft || '0') - WIDTH / 2;
      return new DOMRect(left, 0, WIDTH, 32);
    },
  });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(280, 200, 40, 20),
  });
  const frame = window.requestAnimationFrame;
  window.requestAnimationFrame = (callback) => {
    callback(0);
    return 1;
  };
  const message = document.createElement('p');
  message.setAttribute('data-message-id', 'm1');
  message.textContent = 'Ship on Friday';
  document.body.append(message);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  function Harness() {
    const quote = useSelectionQuote(true, () => true);
    return quote === undefined
      ? null
      : createElement(SelectionToolbar, {
          x: quote.x,
          y: quote.y,
          below: quote.below,
          label: 'Quote',
          children: null,
        });
  }
  try {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => {
      window.getSelection()!.selectAllChildren(message);
      document.dispatchEvent(new Event('selectionchange'));
    });
    const edges = () => {
      const rect = document.body
        .querySelector<HTMLElement>('[data-selection-toolbar]')!
        .getBoundingClientRect();
      return [rect.left, rect.right];
    };
    expect(edges()).toEqual([250, 350]);
    width(320);
    await act(async () => window.dispatchEvent(new Event('resize')));
    expect(edges()).toEqual([212, 312]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    message.remove();
    window.requestAnimationFrame = frame;
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  }
});
