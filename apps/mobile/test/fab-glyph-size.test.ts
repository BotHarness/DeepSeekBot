import { describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'ios' }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: platform,
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));

import { resolveTheme } from '../src/ui/design/resolve-theme';
import { fab } from '../src/ui/design/tokens';
import { fabGlyphSize } from '../src/ui/shell/navigation-action-pressable';

const theme = (os: 'ios' | 'android', fontScale: number) => ({
  ...resolveTheme('light', {}, os),
  fontScale,
});

describe('fabGlyphSize', () => {
  it('follows iOS Dynamic Type up to xxxLarge, then stays inside the circle', () => {
    platform.OS = 'ios';
    expect(fabGlyphSize(theme('ios', 1))).toBe(22);
    expect(fabGlyphSize(theme('ios', 1.235))).toBeCloseTo(22 * 1.235);
    const xxxLarge = fabGlyphSize(theme('ios', 1.353));
    expect(fabGlyphSize(theme('ios', 3.571))).toBe(xxxLarge);
    expect(xxxLarge).toBeLessThanOrEqual(fab.size * 0.6);
  });

  it('keeps the Material 24dp FAB icon on Android at every text size', () => {
    platform.OS = 'android';
    expect(fabGlyphSize(theme('android', 1))).toBe(24);
    expect(fabGlyphSize(theme('android', 2))).toBe(24);
  });
});
