import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', async () => import('./react-native-shim'));

const { HorizontalScroll } = await import('../src/ui/primitives/horizontal-scroll');
const { ReplySwipeBlocker } = await import('../src/ui/chat/reply-swipe-context');

it('lets a scroller inside a reply-swipe bubble claim its own horizontal drags', () => {
  const Blocker = ({ children }: { children: ReactNode; blocking: boolean }) =>
    createElement('section', { 'data-blocker': 'reply' }, children);
  const html = renderToStaticMarkup(
    createElement(
      ReplySwipeBlocker.Provider,
      { value: Blocker },
      createElement(HorizontalScroll, null, 'wide table'),
    ),
  );
  expect(html).toContain('data-blocker="reply"');
  expect(html).toContain('wide table');
});

it('is a plain horizontal scroller outside a bubble', () => {
  const html = renderToStaticMarkup(createElement(HorizontalScroll, null, 'code'));
  expect(html).not.toContain('data-blocker');
  expect(html).toContain('code');
});
