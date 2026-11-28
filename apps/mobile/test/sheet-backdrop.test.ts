import { expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'ios', Version: '26' as string | number }));

vi.mock('react-native', () => ({
  Platform: platform,
  PlatformColor: (...semantic: string[]) => ({ semantic }),
}));

const { systemSheetBackdrop } = await import('../src/ui/primitives/sheet-backdrop');

it.each([
  ['26', 'transparent'],
  ['26.1', 'transparent'],
  ['26.1.1', 'transparent'],
  ['27.2', 'transparent'],
  ['18.7', { semantic: ['systemBackground'] }],
])('leaves iOS %s on the system sheet background', (version, backdrop) => {
  platform.OS = 'ios';
  platform.Version = version;
  expect(systemSheetBackdrop()).toEqual(backdrop);
});

it('never paints a backdrop off iOS', () => {
  platform.OS = 'android';
  platform.Version = 36;
  expect(systemSheetBackdrop()).toBe('transparent');
});
