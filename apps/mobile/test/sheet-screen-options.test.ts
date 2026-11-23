import { afterEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'ios' as 'ios' | 'android' }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: platform,
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ back() {} }) }));

import { sheetScreenOptions } from '../src/ui/primitives/sheet-screen';
import type { DesignTheme } from '../src/ui/design/theme';

const theme = { overlay: { fill: '#fff' } } as unknown as DesignTheme;

afterEach(() => {
  platform.OS = 'ios';
});

describe('creation sheet detents', () => {
  it('keeps the medium and large detents on iOS', () => {
    expect(sheetScreenOptions(theme).sheetAllowedDetents).toEqual([0.75, 1]);
    expect(sheetScreenOptions(theme, true).sheetAllowedDetents).toEqual([1]);
  });

  it('opens the Android bottom sheet expanded so its footer starts on screen', () => {
    platform.OS = 'android';
    expect(sheetScreenOptions(theme).sheetAllowedDetents).toEqual([1]);
    expect(sheetScreenOptions(theme, true).sheetAllowedDetents).toEqual([1]);
  });
});
