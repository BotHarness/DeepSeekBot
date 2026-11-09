// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  flySentBubble,
  launchSendFlight,
  sentMessageId,
  shouldFly,
} from '../src/client/send-fly.js';
import type { ChannelMessage } from '../src/client/store.js';

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function pane(scroll: { top: number; height: number; client: number }) {
  const root = document.createElement('div');
  const viewport = document.createElement('div');
  viewport.className = 'bh-chat-body';
  Object.defineProperties(viewport, {
    scrollHeight: { value: scroll.height },
    clientHeight: { value: scroll.client },
  });
  viewport.scrollTop = scroll.top;
  const shell = document.createElement('div');
  shell.className = 'bh-composer-shell';
  const input = document.createElement('div');
  input.className = 'bh-composer-input';
  input.getBoundingClientRect = () => rect(40, 700, 400, 24);
  shell.append(input);
  root.append(viewport, shell);
  document.body.append(root);
  return viewport;
}

const human = (id: string, pending = false): ChannelMessage => ({
  id,
  at: '2026-11-09T09:41:00.000Z',
  author: { kind: 'human' },
  body: id,
  ...(pending ? { pending: true } : {}),
});

afterEach(() => {
  document.body.replaceChildren();
  delete document.documentElement.dataset['botharnessMotion'];
});

describe('send fly decision', () => {
  it.each([
    { atLatest: true, reducedMotion: false, fly: true },
    { atLatest: true, reducedMotion: true, fly: false },
    { atLatest: false, reducedMotion: false, fly: false },
    { atLatest: false, reducedMotion: true, fly: false },
  ])('flies only at the newest message with motion on (%o)', ({ atLatest, reducedMotion, fly }) => {
    expect(shouldFly({ atLatest, reducedMotion })).toBe(fly);
  });

  it('requests a fly from the composer text when sending at the newest message', () => {
    const viewport = pane({ top: 1500, height: 2000, client: 500 });
    const flight = launchSendFlight(viewport, false, [human('old', true)]);
    expect(flight?.from).toMatchObject({ left: 40, top: 700 });
    expect(viewport.scrollTop).toBe(1500);
    expect(sentMessageId(flight!, [human('old', true), human('sent', true)])).toBe('sent');
  });

  it('requests no fly and leaves the scroll offset unchanged while reading history', () => {
    const viewport = pane({ top: 900, height: 2000, client: 500 });
    expect(launchSendFlight(viewport, false, [])).toBeUndefined();
    expect(viewport.scrollTop).toBe(900);
  });

  it('requests no fly when newer history is still unloaded or Reduce Motion is on', () => {
    const viewport = pane({ top: 1500, height: 2000, client: 500 });
    expect(launchSendFlight(viewport, true, [])).toBeUndefined();
    document.documentElement.dataset['botharnessMotion'] = 'reduce';
    expect(launchSendFlight(viewport, false, [])).toBeUndefined();
  });
});

describe('send fly animation', () => {
  it('flies only the new bubble from the composer text to its laid-out frame', () => {
    const bubble = document.createElement('div');
    bubble.className = 'bh-bubble';
    bubble.style.paddingLeft = '12px';
    bubble.style.paddingBottom = '8px';
    bubble.getBoundingClientRect = () => rect(300, 600, 160, 40);
    document.body.append(bubble);
    const animate = vi.fn();
    bubble.animate = animate;
    flySentBubble(bubble, rect(40, 700, 400, 24));
    expect(animate).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          transform: 'translate(-272px, 92px)',
          backgroundColor: 'transparent',
        }),
        { transform: 'none' },
      ],
      expect.objectContaining({ duration: 360 }),
    );
  });
});
