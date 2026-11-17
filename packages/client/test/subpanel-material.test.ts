// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Appearance } from '../src/client/appearance.js';
import { appearanceCss } from '../src/client/appearance-scope.js';
import { Wallpaper } from '../src/client/wallpaper.js';
import { mountWallpaper } from '../src/client/wallpaper-layer.js';
import { WORKSPACE_CSS } from '../src/client/workspace-styles.js';
import { memoryWallpaperStore } from './wallpaper-memory.js';

afterEach(() => {
  vi.unstubAllGlobals();
  document.head.innerHTML = '';
});

function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
}

function wallpaperCss(): string {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal('BroadcastChannel', undefined);
  const owner = new Wallpaper(memoryWallpaperStore().store, async () => {
    throw new Error('unused');
  });
  const off = mountWallpaper(owner);
  const css = document.head.querySelector(
    'style[data-plugin-css="@botharness/ui/wallpaper"]',
  )!.textContent!;
  off();
  return css;
}

describe('Sub panel material', () => {
  it('lets the panel material and wallpaper show through the sub panel column', () => {
    const column = rule(WORKSPACE_CSS, '.bh-subpanel-column');
    expect(column).toContain('overflow-y:auto');
    expect(column).not.toContain('background');
  });

  it('clears the gaps between sub panel entries over a wallpaper', () => {
    expect(rule(WORKSPACE_CSS, '.bh-subpanel-entry + .bh-subpanel-entry')).toContain(
      'solid var(--bh-subpanel-gap-fill,',
    );
    expect(wallpaperCss()).toMatch(
      /\[data-wallpaper-active\] \{[^}]*--bh-wallpaper-ink:1; --bh-subpanel-gap-fill:transparent;/,
    );
  });

  it('darkens secondary ink in light mode only while a wallpaper is active', () => {
    const tokens = (mode: 'light' | 'dark') =>
      appearanceCss(
        new Appearance(
          { getItem: () => null, setItem: () => {} },
          () => mode,
          () => '1',
        ).getSnapshot(),
      );
    const light = tokens('light');
    for (const [token, share] of [
      ['--tobs-ink-secondary', 40],
      ['--tobs-ink-tertiary', 35],
      ['--tobs-ink-quiet', 30],
    ] as const)
      expect(light).toMatch(
        new RegExp(
          `${token}:color-mix\\(in srgb, #[0-9a-f]{6} calc\\(var\\(--bh-wallpaper-ink, 0\\) \\* ${share}%\\), #[0-9a-f]{6}\\)`,
          'i',
        ),
      );
    expect(tokens('dark')).not.toContain('--bh-wallpaper-ink');
  });
});
