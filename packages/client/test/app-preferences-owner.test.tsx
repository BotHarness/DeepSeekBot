// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({}));
vi.mock('../src/client/appearance-pickers.js', () => ({
  ColorSchemePicker: ({ onChange }: { onChange(value: 'dark'): void }) =>
    createElement('button', { onClick: () => onChange('dark') }, 'Change Client theme'),
  PrimaryColorPicker: () => null,
  ThemePresetPicker: () => null,
  applyPreset: () => {},
}));
vi.mock('../src/client/bot-mode-setting-rows.js', () => ({
  MotionSetting: () => {
    throw Error('Host motion settings must not mount in App preferences');
  },
  BotIconSetting: () => {
    throw Error('Host Bot icon settings must not mount in App preferences');
  },
}));
vi.mock('../src/client/ds/select.js', () => ({
  Select: () => createElement('div', {}, 'Host language control'),
}));
vi.mock('../src/client/wallpaper-settings.js', () => ({ WallpaperSettings: () => null }));
vi.mock('../src/client/appearance-material-settings.js', () => ({
  AppearanceMaterialSettings: () => null,
}));
vi.mock('../src/client/appearance-recovery-settings.js', () => ({
  AppearanceRecoverySettings: () => null,
}));

import { AppearanceSection } from '../src/client/appearance-settings.js';
import { Appearance } from '../src/client/appearance.js';
import { Wallpaper } from '../src/client/wallpaper.js';
import { createWallpaperStore } from '../src/client/wallpaper-store.js';
import {
  BotModePrefs,
  botModePrefsFace,
  type BotModePrefsSnapshot,
} from '../src/client/bot-mode-prefs.js';
import { en } from '../src/client/locale.js';
import { searchSettings } from '../src/client/settings-search.js';

const t = (key: string) => Object.entries(en).find(([name]) => name === key)?.[1] ?? key;

it('changes the existing Client appearance owner without mounting Host preference writers', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const values = new Map<string, string>();
  const localWrite = vi.fn((key: string, value: string) => values.set(key, value));
  const appearance = new Appearance(
    { getItem: (key) => values.get(key) ?? null, setItem: localWrite },
    () => 'light',
  );
  const prefs = new BotModePrefs();
  const { hooks: _hooks, ...commands } = botModePrefsFace(prefs);
  const hostWrite = vi.fn();
  const languageWrite = vi.fn();
  const locale = { active: 'en', locales: [], revision: 0 };
  const renderLayout = vi.fn(() => createElement('div', {}, 'Audited Client layout'));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(
        createElement(AppearanceSection, {
          ...commands,
          setMotionPreference: hostWrite,
          setBotIcon: hostWrite,
          useBotModePrefs: <T,>(selector: (state: BotModePrefsSnapshot) => T) =>
            selector(prefs.source.getSnapshot()),
          appearance,
          wallpaper: new Wallpaper(createWallpaperStore(undefined)),
          localeSource: {
            getSnapshot: () => locale,
            subscribe: () => () => {},
            setLocale: languageWrite,
          },
          renderSlot: renderLayout,
          clientOnly: true,
          t,
        }),
      ),
    );
    expect(container.textContent).not.toContain('Host language control');
    expect(container.textContent).toContain('Audited Client layout');
    await act(() => container.querySelector('button')?.click());
    expect(appearance.getSnapshot().config.preference).toBe('dark');
    expect(localWrite).toHaveBeenCalled();
    expect(hostWrite).not.toHaveBeenCalled();
    expect(languageWrite).not.toHaveBeenCalled();
    expect(renderLayout).toHaveBeenCalledWith(
      'botharness.settings.layout',
      {},
      { only: 'workspace-layout' },
    );
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});

it('does not offer hidden Host-owned appearance controls in Client preference search', () => {
  const rows = [{ id: 'appearance', order: 5, label: 'Appearance' }];
  expect(searchSettings(rows, 'language', t, true)).toEqual([]);
  expect(searchSettings(rows, 'motion', t, true)).toEqual([]);
  expect(searchSettings(rows, 'theme', t, true).length).toBeGreaterThan(0);
  expect(searchSettings(rows, 'language', t).length).toBeGreaterThan(0);
});
