import { describe, expect, it, vi } from 'vitest';
import { createInterfacePreferences, preferredLanguage } from '../src/ui/interface-preferences';

describe('phone interface preferences', () => {
  it('remembers Session sort across device preference restores', async () => {
    let stored: unknown = { sessionsTab: true };
    const storage = {
      read: async () => stored,
      write: (value: unknown) => {
        stored = value;
      },
    };
    const preferences = createInterfacePreferences();
    await preferences.restore(storage);
    expect(preferences.getSnapshot().sessionSort).toBe('last-human-turn');
    preferences.setSessionSort('created');
    const restarted = createInterfacePreferences();
    await restarted.restore(storage);
    expect(restarted.getSnapshot().sessionSort).toBe('created');
  });

  it('remembers the Session navigation style and landing choices on the phone', async () => {
    let stored: unknown = {
      sessionNavigation: 'sideways',
      sessionLaunch: 'last',
      sessionReturn: 7,
    };
    const storage = {
      read: async () => stored,
      write: (value: unknown) => {
        stored = value;
      },
    };
    const preferences = createInterfacePreferences();
    await preferences.restore(storage);
    expect(preferences.getSnapshot()).toMatchObject({
      sessionNavigation: 'drawer',
      sessionLaunch: 'last',
      sessionReturn: 'stay',
    });
    preferences.setSessionNavigation('stacked');
    preferences.setSessionReturn('list');
    const restarted = createInterfacePreferences();
    await restarted.restore(storage);
    expect(restarted.getSnapshot()).toMatchObject({
      sessionNavigation: 'stacked',
      sessionLaunch: 'last',
      sessionReturn: 'list',
    });
  });

  it('restores the saved Session sort when appearance changes during the read', async () => {
    const preferences = createInterfacePreferences();
    const write = vi.fn();
    const restore = preferences.restore({
      read: async () => ({
        appearance: 'light',
        sessionSort: 'last-activity',
        tabOrder: ['pinned', 'chats', 'activity', 'sessions', 'settings'],
      }),
      write,
    });
    preferences.setAppearance('dark');
    await restore;
    const expected = {
      appearance: 'dark',
      sessionSort: 'last-activity',
      tabOrder: ['pinned', 'chats', 'activity', 'sessions', 'settings'],
    };
    expect(preferences.getSnapshot()).toMatchObject(expected);
    expect(write).toHaveBeenCalledWith(expect.objectContaining(expected));
  });

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

  it('keeps the tab order on this phone with the Pinned tab right of Chats by default', async () => {
    let saved: unknown = { language: 'zh', sessionsTab: false };
    const storage = {
      read: async () => saved,
      write: (value: unknown) => {
        saved = value;
      },
    };
    const preferences = createInterfacePreferences();
    await preferences.restore(storage);
    expect(preferences.getSnapshot().tabOrder).toEqual([
      'chats',
      'pinned',
      'activity',
      'sessions',
      'settings',
    ]);
    preferences.setTabOrder(['settings', 'chats', 'pinned', 'activity', 'sessions']);
    const restarted = createInterfacePreferences();
    await restarted.restore(storage);
    expect(restarted.getSnapshot()).toMatchObject({
      tabOrder: ['settings', 'chats', 'pinned', 'activity', 'sessions'],
      language: 'zh',
    });
  });

  it('keeps Sessions opt-in and its tab position while the switch is off', async () => {
    let saved: unknown = { language: 'zh', tabOrder: ['sessions', 'chats'] };
    const storage = {
      read: async () => saved,
      write: (value: unknown) => {
        saved = value;
      },
    };
    const preferences = createInterfacePreferences();
    expect(preferences.getSnapshot().sessionsTab).toBe(false);
    await preferences.restore(storage);
    expect(preferences.getSnapshot().sessionsTab).toBe(false);
    expect(preferences.getSnapshot().tabOrder[0]).toBe('sessions');
    preferences.setSessionsTab(true);
    const restarted = createInterfacePreferences();
    await restarted.restore(storage);
    expect(restarted.getSnapshot()).toMatchObject({ sessionsTab: true, language: 'zh' });
    expect(restarted.getSnapshot().tabOrder[0]).toBe('sessions');
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
    expect(write).toHaveBeenLastCalledWith({
      language: 'system',
      appearance: 'system',
      inAppAlerts: true,
      inAppAlertStyle: 'overlay',
      sessionsTab: false,
      hideBarsOnScroll: false,
      tabOrder: ['chats', 'pinned', 'activity', 'sessions', 'settings'],
      sessionSort: 'last-human-turn',
      hideBotSessions: false,
      sessionNavigation: 'drawer',
      sessionLaunch: 'new',
      sessionReturn: 'stay',
    });
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
    preferences.retrySave();
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
    expect(write).toHaveBeenCalledWith({
      language: 'zh',
      appearance: 'dark',
      inAppAlerts: true,
      inAppAlertStyle: 'overlay',
      sessionsTab: false,
      hideBarsOnScroll: false,
      tabOrder: ['chats', 'pinned', 'activity', 'sessions', 'settings'],
      sessionSort: 'last-human-turn',
      hideBotSessions: false,
      sessionNavigation: 'drawer',
      sessionLaunch: 'new',
      sessionReturn: 'stay',
    });
  });

  it('persists the in-app alert choice independently of language and appearance', async () => {
    let saved: unknown = { language: 'zh', appearance: 'dark' };
    const storage = {
      read: async () => saved,
      write: (value: unknown) => {
        saved = value;
      },
    };
    const preferences = createInterfacePreferences();
    await preferences.restore(storage);
    expect(preferences.getSnapshot().inAppAlerts).toBe(true);
    preferences.setInAppAlerts(false);
    preferences.setInAppAlertStyle('overlay');
    const restarted = createInterfacePreferences();
    await restarted.restore(storage);
    expect(restarted.getSnapshot()).toMatchObject({
      inAppAlerts: false,
      inAppAlertStyle: 'overlay',
      language: 'zh',
      appearance: 'dark',
    });
    restarted.setLanguage('en');
    expect(restarted.getSnapshot().inAppAlerts).toBe(false);
    restarted.setInAppAlerts(true);
    expect(restarted.getSnapshot().inAppAlertStyle).toBe('overlay');
  });

  it('defaults unsupported saved styles to overlay presentation', async () => {
    const preferences = createInterfacePreferences();
    await preferences.restore({
      read: async () => ({ inAppAlertStyle: 'system-push' }),
      write() {},
    });
    expect(preferences.getSnapshot().inAppAlertStyle).toBe('overlay');
  });
});

it.each(['inline', 'overlay'] as const)('retains the explicitly saved %s style', async (style) => {
  const preferences = createInterfacePreferences();
  await preferences.restore({ read: async () => ({ inAppAlertStyle: style }), write() {} });
  expect(preferences.getSnapshot().inAppAlertStyle).toBe(style);
});
it('uses overlay for a new install and old settings without a style', async () => {
  const preferences = createInterfacePreferences();
  expect(preferences.getSnapshot().inAppAlertStyle).toBe('overlay');
  await preferences.restore({
    read: async () => ({ language: 'zh', inAppAlerts: false }),
    write() {},
  });
  expect(preferences.getSnapshot()).toMatchObject({
    inAppAlertStyle: 'overlay',
    language: 'zh',
    inAppAlerts: false,
  });
});

it('remembers the Hide Bot Sessions choice on the phone', async () => {
  const writes: unknown[] = [];
  const preferences = createInterfacePreferences();
  await preferences.restore({ read: async () => undefined, write: (value) => writes.push(value) });
  expect(preferences.getSnapshot().hideBotSessions).toBe(false);
  preferences.setHideBotSessions(true);
  expect(writes.at(-1)).toMatchObject({ hideBotSessions: true });
  const restarted = createInterfacePreferences();
  await restarted.restore({ read: async () => writes.at(-1), write: () => {} });
  expect(restarted.getSnapshot().hideBotSessions).toBe(true);
});

it('keeps bars on screen while scrolling until the phone opts in', async () => {
  const writes: unknown[] = [];
  const preferences = createInterfacePreferences();
  await preferences.restore({ read: async () => undefined, write: (value) => writes.push(value) });
  expect(preferences.getSnapshot().hideBarsOnScroll).toBe(false);
  preferences.setHideBarsOnScroll(true);
  expect(writes.at(-1)).toMatchObject({ hideBarsOnScroll: true });
  const restarted = createInterfacePreferences();
  await restarted.restore({ read: async () => writes.at(-1), write: () => {} });
  expect(restarted.getSnapshot().hideBarsOnScroll).toBe(true);
});
