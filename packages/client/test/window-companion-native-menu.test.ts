// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WindowCompanion } from '../src/client/window-companion.js';
import { WindowCompanionView } from '../src/client/window-companion-view.js';
import { zhTranslate } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),

  IconEllipsisOutlineRegular: () => null,
  IconCloseFillRegular: () => null,
  IconNewChatOutlineRegular: () => null,
}));

it('hands character keyboard focus to the portaled menu and restores it after dismissal', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const events = new EventTarget();
  const companion = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
  });
  await companion.start();
  companion.select('ada');
  events.dispatchEvent(
    new MessageEvent('companion/baseline', {
      data: JSON.stringify({
        profileId: 'qa',
        bot: { slug: 'ada', name: 'Ada', paused: false },
        activity: { generation: 'host', revision: 0, bots: [{ slug: 'ada', state: 'idle' }] },
      }),
    }),
  );
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  try {
    await act(() =>
      root.render(
        createElement(WindowCompanionView, {
          companion,
          openDm() {},
          openAttention() {},
          openChannel() {},
          t: zhTranslate,
        }),
      ),
    );
    const character = node.querySelector('.bh-companion-character');
    if (!(character instanceof HTMLButtonElement)) throw new Error('Missing character');
    await act(() => character.focus());
    await act(() =>
      character.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'F10',
          shiftKey: true,
          bubbles: true,
        }),
      ),
    );
    await act(() => {
      for (const callback of frames.splice(0)) callback(0);
      vi.advanceTimersByTime(0);
    });
    const rows = [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')];
    expect(rows.length).toBeGreaterThan(2);
    expect(document.activeElement).toBe(rows[0]);
    await act(() =>
      rows[0]!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          bubbles: true,
        }),
      ),
    );
    expect(document.activeElement).toBe(rows[1]);
    await act(() =>
      rows[1]!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
        }),
      ),
    );
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(character);
    await act(() =>
      character.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }),
      ),
    );
    await act(() => root.unmount());
    const survivingControl = document.createElement('button');
    document.body.append(survivingControl);
    survivingControl.focus();
    await act(() => {
      for (const callback of frames.splice(0)) callback(0);
      vi.advanceTimersByTime(0);
    });
    expect(document.activeElement).toBe(survivingControl);
    survivingControl.remove();
  } finally {
    await act(() => root.unmount());
    companion.dispose();
    node.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
