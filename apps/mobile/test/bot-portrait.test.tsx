// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { avatarSvg, seededAvatarFor } from '../../../packages/core/src/bots/avatar-appearance';
import { seededLineRecipe } from '../../../packages/core/src/bots/avatar-line';

const { picture } = vi.hoisted(() => ({
  picture: ({
    source,
    contentFit,
    onLoadEnd,
  }: {
    source: { uri: string };
    contentFit?: string;
    onLoadEnd?: () => void;
  }) => {
    const { createElement: element } = require('react') as typeof import('react');
    return element('img', { src: source.uri, 'data-fit': contentFit, onLoad: onLoadEnd });
  },
}));
vi.mock('react-native', () => ({
  View: ({ children, style }: { children?: ReactNode; style?: { backgroundColor?: string } }) =>
    createElement('div', { 'data-fill': style?.backgroundColor ?? 'none' }, children),
  Image: picture,
}));
vi.mock('expo-image', () => ({ Image: picture }));
vi.mock('react-native-reanimated', () => ({
  default: { createAnimatedComponent: () => () => null },
}));
vi.mock('react-native-svg', () => ({ default: () => null, Rect: () => null }));
vi.mock('../src/ui/theme', () => ({ useTheme: () => ({ border: 'border-grey' }) }));
vi.mock('../src/ui/primitives/resource-image', () => ({ ResourceImage: picture }));
import { BotPortrait } from '../src/ui/bot-avatar';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it('uses the same artwork for seeded and customized Bots, with uploaded images taking precedence', () => {
  const element = document.createElement('div');
  const root = createRoot(element);
  const recipe = seededAvatarFor('Customized', 2);
  const bot = {
    slug: 'ada',
    displayName: 'Ada',
    avatarSeed: 2,
    appearance: { revision: 'a'.repeat(64), recipe },
  } satisfies Parameters<typeof BotPortrait>[0]['bot'];
  try {
    act(() => root.render(<BotPortrait bot={bot} size={48} />));
    expect(element.querySelector('img')?.getAttribute('src')).toBe(
      `data:image/svg+xml;base64,${btoa(avatarSvg(recipe, { squareBackdrop: true }))}`,
    );
    act(() =>
      root.render(
        <BotPortrait bot={{ slug: 'ada', displayName: 'Ada', avatarSeed: 2 }} size={48} />,
      ),
    );
    expect(element.querySelector('img')?.getAttribute('src')).toBe(
      `data:image/svg+xml;base64,${btoa(avatarSvg(seededAvatarFor('Ada', 2), { squareBackdrop: true }))}`,
    );
    act(() =>
      root.render(
        <BotPortrait
          bot={{ ...bot, avatarSource: { uri: 'https://host.test/avatar', headers: {} } }}
          size={48}
        />,
      ),
    );
    expect(element.querySelector('img')?.getAttribute('src')).toBe('https://host.test/avatar');
  } finally {
    act(() => root.unmount());
  }
});

it('fills the circle edge to edge for every avatar kind, with no border ring around the artwork', () => {
  const element = document.createElement('div');
  const root = createRoot(element);
  const clip = () => element.querySelector<HTMLElement>('[data-fill]')?.dataset.fill;
  const svgOf = () => atob(element.querySelector('img')?.getAttribute('src')?.split(',')[1] ?? '');
  try {
    const recipes = [
      seededAvatarFor('Ada', 2),
      seededAvatarFor('Grace', undefined),
      seededLineRecipe('Line'),
    ];
    for (const [seed, recipe] of recipes.entries()) {
      act(() =>
        root.render(
          <BotPortrait
            bot={{
              slug: `b${seed}`,
              displayName: `Bot ${seed}`,
              appearance: { revision: 'a'.repeat(64), recipe },
            }}
            size={24}
            corner={4}
          />,
        ),
      );
      const svg = svgOf();
      expect(svg).toMatch(/^<svg\b[^>]*><rect width="(32|48)" height="(32|48)" fill="#/);
      expect(clip()).toBe(/<rect [^>]*fill="(#[0-9a-f]+)"/iu.exec(svg)?.[1]);
      expect(clip()).not.toBe('border-grey');
      expect(element.querySelector('img')?.dataset.fit).toBe('cover');
    }
    for (const bot of [
      {
        slug: 'up',
        displayName: 'Up',
        avatarSource: { uri: 'https://host.test/up.png', headers: {} },
      },
      { slug: 'url', displayName: 'Url', avatarUrl: 'https://host.test/url.png' },
    ]) {
      act(() => root.render(<BotPortrait bot={bot} size={48} />));
      expect(clip()).toBe('border-grey');
      act(() => {
        element.querySelector('img')?.dispatchEvent(new Event('load'));
      });
      expect(clip()).toBe('none');
    }
  } finally {
    act(() => root.unmount());
  }
});
