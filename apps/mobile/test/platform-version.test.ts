import { expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'ios', Version: '26' as string | number }));

vi.mock('react-native', () => ({ Platform: platform }));

const { iosMajor } = await import('../src/ui/platform-version');

it.each([
  ['26', 26],
  ['26.1', 26],
  ['26.1.1', 26],
  ['27.2', 27],
  ['18.7', 18],
  ['', 0],
])('reads iOS %j as major %i', (version, major) => {
  platform.OS = 'ios';
  platform.Version = version;
  expect(iosMajor()).toBe(major);
});

it('reports no iOS major off iOS', () => {
  platform.OS = 'android';
  platform.Version = 36;
  expect(iosMajor()).toBe(0);
});
