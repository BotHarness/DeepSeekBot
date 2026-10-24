// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  localStorage.clear();
});

async function boot() {
  await import('../src/ui/native-interface-preferences.web');
  const { interfacePreferences } = await import('../src/ui/interface-preferences');
  await Promise.resolve();
  return interfacePreferences;
}

it('keeps browser preview choices across a fresh app launch', async () => {
  const first = await boot();
  expect(first.getSnapshot()).toMatchObject({ loaded: true, storageError: false, locale: 'en' });
  first.setLanguage('zh');
  first.setAppearance('dark');
  vi.resetModules();
  const next = await boot();
  expect(next.getSnapshot()).toMatchObject({
    loaded: true,
    storageError: false,
    language: 'zh',
    locale: 'zh',
    appearance: 'dark',
  });
});

it('keeps the preview usable when browser storage is denied', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('denied');
  });
  const preferences = await boot();
  expect(preferences.getSnapshot()).toMatchObject({ loaded: true, storageError: true });
  preferences.setLanguage('zh');
  preferences.setAppearance('dark');
  expect(preferences.getSnapshot()).toMatchObject({
    locale: 'zh',
    appearance: 'dark',
    storageError: true,
  });
});
