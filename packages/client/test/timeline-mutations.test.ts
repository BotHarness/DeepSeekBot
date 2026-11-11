// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { outsideTimeline } from '../src/client/timeline-mutations.js';

it('ignores mutations inside the chat timeline and reports any other one', () => {
  document.body.innerHTML =
    '<nav><button></button></nav><div class="bh-chat-body"><div class="slot"><p>hi</p></div></div>';
  const slot = document.querySelector('.slot')!;
  const text = document.querySelector('p')!.firstChild!;
  const nav = document.querySelector('nav')!;
  const record = (target: Node) => ({ target }) as MutationRecord;
  expect(outsideTimeline([record(slot), record(text)])).toBe(false);
  expect(outsideTimeline([record(slot), record(nav)])).toBe(true);
  expect(outsideTimeline([record(document.body)])).toBe(true);
});
