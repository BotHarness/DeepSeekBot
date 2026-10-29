// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  localStorage.clear();
});

async function boot() {
  await import('../scripts/web-preview/interface-preferences');
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

it('limits screenshot overrides to the two named Web modules', () => {
  type Resolution = { type: string; filePath: string };
  type Config = {
    resolver: {
      resolveRequest(context: object, name: string, platform: string): Resolution;
    };
  };
  const withWebPreview: (config: Config) => Config = createRequire(import.meta.url)(
    '../scripts/web-preview/metro.cjs',
  );
  const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const native = path.join(mobile, 'src/ui/native-interface-preferences.ts');
  const symbol = path.join(mobile, 'src/ui/primitives/system-symbol.tsx');
  const config = withWebPreview({
    resolver: { resolveRequest: (_context, name) => ({ type: 'sourceFile', filePath: name }) },
  });
  const resolve = (name: string, platform: string) =>
    config.resolver.resolveRequest({}, name, platform).filePath;
  for (const platform of ['ios', 'android']) {
    expect(resolve(native, platform)).toBe(native);
    expect(resolve(symbol, platform)).toBe(symbol);
  }
  expect(resolve(native, 'web')).toBe(
    path.join(mobile, 'scripts/web-preview/interface-preferences.ts'),
  );
  expect(resolve(symbol, 'web')).toBe(path.join(mobile, 'scripts/web-preview/system-symbol.tsx'));
  expect(resolve('other-module.ts', 'web')).toBe('other-module.ts');
});
