// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { avatarSvg, seededAvatarFor } from '../../../packages/core/src/bots/avatar-appearance';

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Image: ({ source }: { source: { uri: string } }) => createElement('img', { src: source.uri }),
}));
vi.mock('expo-image', () => ({
  Image: ({ source }: { source: { uri: string } }) => createElement('img', { src: source.uri }),
}));
vi.mock('react-native-reanimated', () => ({
  default: { createAnimatedComponent: () => () => null },
}));
vi.mock('react-native-svg', () => ({ default: () => null, Rect: () => null }));
vi.mock('../src/ui/theme', () => ({ useTheme: () => ({ border: 'transparent' }) }));
vi.mock('../src/ui/primitives/resource-image', () => ({
  ResourceImage: ({ source }: { source: { uri: string } }) =>
    createElement('img', { src: source.uri }),
}));
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
      `data:image/svg+xml;base64,${btoa(avatarSvg(recipe))}`,
    );
    act(() =>
      root.render(
        <BotPortrait bot={{ slug: 'ada', displayName: 'Ada', avatarSeed: 2 }} size={48} />,
      ),
    );
    expect(element.querySelector('img')?.getAttribute('src')).toBe(
      `data:image/svg+xml;base64,${btoa(avatarSvg(seededAvatarFor('Ada', 2)))}`,
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
