import { describe, expect, it, vi } from 'vitest';
import { createInterfacePreferences, preferredLanguage } from '../src/ui/interface-preferences';

describe('phone interface preferences', () => {
  it('defaults to system and chooses the first supported preferred language', () => {
    const preferences = createInterfacePreferences();
    expect(preferences.getSnapshot()).toMatchObject({ language: 'system', appearance: 'system' });
    expect(preferredLanguage(['ja-JP', 'zh-Hans-CN', 'en-US'])).toBe('zh');
    expect(preferredLanguage(['en-GB', 'zh-CN'])).toBe('en');
    expect(preferredLanguage(['fr-FR'])).toBe('en');
    expect(preferredLanguage([])).toBe('en');
  });

  it('applies, persists and restores both independent choices', async () => {
    let saved: unknown;
    const storage = {
      read: async () => saved,
      write: (value: unknown) => {
        saved = structuredClone(value);
      },
    };
    const preferences = createInterfacePreferences();
    await preferences.restore(storage);
    preferences.setLanguage('zh');
    preferences.setAppearance('dark');
    expect(preferences.getSnapshot()).toMatchObject({
      language: 'zh',
      locale: 'zh',
      appearance: 'dark',
    });
    const restarted = createInterfacePreferences();
    await restarted.restore(storage);
    expect(restarted.getSnapshot()).toMatchObject({
      language: 'zh',
      locale: 'zh',
      appearance: 'dark',
      loaded: true,
      storageError: false,
    });
  });

  it('respects explicit language until follow system is selected again', async () => {
    const preferences = createInterfacePreferences();
    const write = vi.fn();
    await preferences.restore({ read: async () => undefined, write });
    preferences.setSystemLocales(['zh-CN']);
    expect(preferences.getSnapshot().locale).toBe('zh');
    preferences.setLanguage('en');
    preferences.setSystemLocales(['zh-Hans']);
    expect(preferences.getSnapshot().locale).toBe('en');
    preferences.setLanguage('system');
    expect(preferences.getSnapshot().locale).toBe('zh');
    preferences.setSystemLocales(['de-DE']);
    expect(preferences.getSnapshot().locale).toBe('en');
    expect(write).toHaveBeenLastCalledWith({ language: 'system', appearance: 'system' });
  });

  it.each([undefined, null, 'dark', { language: 'es', appearance: 'midnight' }])(
    'ignores invalid saved data %j',
    async (saved) => {
      const preferences = createInterfacePreferences();
      await preferences.restore({ read: async () => saved, write() {} });
      expect(preferences.getSnapshot()).toMatchObject({
        language: 'system',
        appearance: 'system',
        loaded: true,
      });
    },
  );

  it('keeps the selected choice usable after a failed save and retries on selection', async () => {
    const preferences = createInterfacePreferences();
    const write = vi.fn().mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    await preferences.restore({ read: async () => undefined, write });
    preferences.setAppearance('dark');
    expect(preferences.getSnapshot()).toMatchObject({ appearance: 'dark', storageError: true });
    preferences.setAppearance('dark');
    expect(preferences.getSnapshot()).toMatchObject({ appearance: 'dark', storageError: false });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('shows read failures and recovers on a successful save', async () => {
    const preferences = createInterfacePreferences();
    await preferences.restore({
      read: async () => {
        throw new Error('unreadable');
      },
      write() {},
    });
    expect(preferences.getSnapshot()).toMatchObject({ loaded: true, storageError: true });
    preferences.setLanguage('en');
    expect(preferences.getSnapshot().storageError).toBe(false);
  });

  it('does not overwrite a user selection with a late startup read', async () => {
    const preferences = createInterfacePreferences();
    let finish: (value: unknown) => void = () => {};
    const write = vi.fn();
    const restore = preferences.restore({
      read: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      write,
    });
    preferences.setLanguage('zh');
    preferences.setAppearance('dark');
    finish({ language: 'en', appearance: 'light' });
    await restore;
    expect(preferences.getSnapshot()).toMatchObject({ language: 'zh', appearance: 'dark' });
    expect(write).toHaveBeenCalledWith({ language: 'zh', appearance: 'dark' });
  });
});
