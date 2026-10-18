// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  View: ({ style, children }: { style: unknown; children: React.ReactNode }) =>
    createElement('div', { 'data-style': JSON.stringify(style) }, children),
}));
vi.mock('expo-image', () => ({
  Image: ({ contentFit, contentPosition }: { contentFit: string; contentPosition: unknown }) =>
    createElement('img', {
      'data-fit': contentFit,
      'data-position': JSON.stringify(contentPosition),
    }),
}));
import { ChatBackground } from '../src/ui/chat/chat-background';
import { DesignThemeProvider, resolveTheme } from '../src/ui/design/theme';

it.each([0, 60, 100])('applies %s percent only to a separate theme veil', (fade) => {
  for (const scheme of ['light', 'dark'] as const) {
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(
      <DesignThemeProvider appearance={{ scheme }}>
        <ChatBackground
          choice={{
            kind: 'image',
            id: 'owned.jpg',
            width: 300,
            height: 500,
            fit: 'contain',
            x: 0.2,
            y: 0.8,
            fade,
          }}
          imageUri={(id) => id}
        />
        <span>Ordinary messages</span>
      </DesignThemeProvider>,
    );
    const root = host.firstElementChild!;
    const veil = root.querySelector('div')!;
    expect(JSON.parse(root.getAttribute('data-style')!).opacity).toBeUndefined();
    expect(JSON.parse(veil.getAttribute('data-style')!)).toMatchObject({
      opacity: fade / 100,
      backgroundColor: resolveTheme(scheme, {}, 'ios').color.base,
    });
    expect(host.querySelector('img')?.getAttribute('data-fit')).toBe('contain');
    expect(host.querySelector('img')?.getAttribute('data-position')).toBe(
      '{"left":"20%","top":"80%"}',
    );
    expect(host.lastElementChild?.textContent).toBe('Ordinary messages');
  }
});
