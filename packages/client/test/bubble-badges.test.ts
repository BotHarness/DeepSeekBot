// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  MenuSurface: ({ children }: { children: ReactNode }) => children,
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));

import { BubbleBadges, keptReactions } from '../src/client/bubble-badges.js';
import { zhTranslate } from '../src/client/locale.js';
import type { ChannelReaction } from '../src/client/store.js';

const reaction = (emoji: string, count = 1): ChannelReaction => ({
  emoji,
  actors: Array.from({ length: count }, (_, index) => ({ kind: 'bot', id: `bot-${index}` })),
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const render = (reactions: readonly ChannelReaction[], readers: readonly string[]) =>
  act(async () =>
    root.render(
      createElement(BubbleBadges, {
        reactions,
        readers,
        mine: false,
        names: (actor) => actor.id,
        bots: [],
        t: zhTranslate,
      }),
    ),
  );

const finish = (element: Element | null) =>
  act(async () => {
    const event = new Event('animationend', { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: 'bh-badge-out' });
    element?.dispatchEvent(event);
  });

const motion = (selector: string) =>
  container.querySelector<HTMLElement>(selector)?.dataset['badgeMotion'];

describe('keptReactions', () => {
  it('keeps a removed chip in place and appends new ones', () => {
    const thumbs = reaction('👍');
    const heart = reaction('❤️');
    const fire = reaction('🔥');
    expect(keptReactions([thumbs, heart], [fire, heart])).toEqual([thumbs, heart, fire]);
    const shown = [thumbs];
    expect(keptReactions(shown, shown)).toBe(shown);
  });
});

describe('BubbleBadges', () => {
  it('shows badges that were already there without an entrance', async () => {
    await render([reaction('👍')], ['ada']);
    expect(motion('[data-reaction="👍"]')).toBeUndefined();
    expect(motion('[data-message-reading]')).toBeUndefined();
  });

  it('scales new badges in and keeps leaving badges until they scale out', async () => {
    await render([], []);
    expect(container.querySelector('.bh-bubble-badges')).toBeNull();
    await render([reaction('👍')], ['ada']);
    expect(motion('[data-reaction="👍"]')).toBe('enter');
    expect(motion('[data-message-reading]')).toBe('enter');

    await render([], []);
    expect(motion('[data-reaction="👍"]')).toBe('leave');
    expect(container.querySelector<HTMLButtonElement>('[data-reaction="👍"]')?.disabled).toBe(true);
    expect(motion('[data-message-reading]')).toBe('leave');
    expect(container.querySelector('[data-message-reading]')?.getAttribute('aria-hidden')).toBe(
      'true',
    );

    await finish(container.querySelector('[data-reaction="👍"]'));
    expect(container.querySelector('[data-reaction="👍"]')).toBeNull();
    await finish(container.querySelector('[data-message-reading]'));
    expect(container.querySelector('.bh-bubble-badges')).toBeNull();
  });

  it('brings a leaving badge back when it returns before the exit ends', async () => {
    await render([], ['ada']);
    await render([], []);
    expect(motion('[data-message-reading]')).toBe('leave');
    await render([], ['ada']);
    expect(motion('[data-message-reading]')).toBe('enter');
  });
});
