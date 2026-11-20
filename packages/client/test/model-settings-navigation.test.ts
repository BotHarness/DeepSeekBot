// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  nativeSettingsNavigation,
  openModelsSettings,
  openModelsSettingsAndReturn,
} from '../src/client/bot-settings-open.js';

afterEach(async () => {
  await vi.runOnlyPendingTimersAsync();
  nativeSettingsNavigation?.close();
  document.body.replaceChildren();
  vi.useRealTimers();
});

it('reveals native Settings without leaving Bot mode and restores the sidebar after closing', async () => {
  vi.useFakeTimers();
  const returned = vi.fn();
  const changed = vi.fn();
  const stopWatching = nativeSettingsNavigation.subscribe(changed);
  const cancel = openModelsSettingsAndReturn(returned);
  expect(nativeSettingsNavigation.getSnapshot()).toBe(true);

  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.dataset.shortcutModal = 'settings';
  const navigation = document.createElement('nav');
  dialog.append(navigation);
  const models = document.createElement('button');
  models.textContent = 'Models';
  const selected = vi.fn();
  models.onclick = selected;
  navigation.append(models);
  document.body.append(dialog);
  await vi.advanceTimersByTimeAsync(1);
  expect(selected).toHaveBeenCalledOnce();
  expect(returned).not.toHaveBeenCalled();
  dialog.append(document.createElement('span'));
  await vi.advanceTimersByTimeAsync(1);
  expect(selected).toHaveBeenCalledOnce();

  dialog.remove();
  await vi.advanceTimersByTimeAsync(1);
  expect(nativeSettingsNavigation.getSnapshot()).toBe(false);
  expect(returned).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenCalledTimes(2);
  cancel();
  stopWatching();
});

it('restores the sidebar on timeout or cancellation without opening another dialog', async () => {
  vi.useFakeTimers();
  const returned = vi.fn();
  const cancel = openModelsSettingsAndReturn(returned);
  cancel();
  await vi.advanceTimersByTimeAsync(10000);
  expect(nativeSettingsNavigation.getSnapshot()).toBe(false);
  expect(returned).not.toHaveBeenCalled();
  openModelsSettingsAndReturn(returned);
  await vi.advanceTimersByTimeAsync(10000);
  expect(nativeSettingsNavigation.getSnapshot()).toBe(false);
  expect(returned).toHaveBeenCalledOnce();
});

it('opens native Models when the Chinese welcome dialog still contains its 模型 picker', async () => {
  vi.useFakeTimers();
  document.body.innerHTML = `
    <div role="dialog" aria-label="欢迎来到 Tobs">
      <button aria-label="模型">请选择模型</button>
    </div>
    <button aria-label="设置"></button>
  `;
  const welcome = document.querySelector('[aria-label="欢迎来到 Tobs"]')!;
  const picker = vi.fn();
  welcome.querySelector('button')!.onclick = picker;
  const nativeSettings = document.createElement('div');
  nativeSettings.innerHTML = `
    <div role="dialog" data-shortcut-modal="settings">
      <nav><button>模型</button></nav>
    </div>
  `;
  const selected = vi.fn();
  nativeSettings.querySelector('button')!.onclick = selected;
  document.querySelector<HTMLButtonElement>('button[aria-label="设置"]')!.onclick = () =>
    document.body.append(nativeSettings);
  const returned = vi.fn();

  openModelsSettingsAndReturn(returned);
  welcome.remove();
  await vi.advanceTimersByTimeAsync(1);

  expect(selected).toHaveBeenCalledOnce();
  expect(picker).not.toHaveBeenCalled();
  expect(returned).not.toHaveBeenCalled();
  nativeSettings.remove();
  await vi.advanceTimersByTimeAsync(1);
  expect(returned).toHaveBeenCalledOnce();
  expect(nativeSettingsNavigation.getSnapshot()).toBe(false);
});

it('selects Models in an already open Settings dialog without clicking either launcher', () => {
  vi.useFakeTimers();
  const app = document.createElement('button');
  app.setAttribute('aria-haspopup', 'dialog');
  const appOpened = vi.fn();
  app.onclick = appOpened;
  const settings = document.createElement('button');
  settings.setAttribute('aria-label', 'Settings');
  settings.setAttribute('aria-expanded', 'true');
  const settingsOpened = vi.fn();
  settings.onclick = settingsOpened;
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.dataset.shortcutModal = 'settings';
  const navigation = document.createElement('nav');
  dialog.append(navigation);
  const models = document.createElement('button');
  models.textContent = 'Models';
  const selected = vi.fn();
  models.onclick = selected;
  navigation.append(models);
  document.body.append(app, settings, dialog);

  openModelsSettings(document);

  expect(appOpened).not.toHaveBeenCalled();
  expect(settingsOpened).not.toHaveBeenCalled();
  expect(selected).toHaveBeenCalledOnce();
});

it.each([
  { label: '模型', appFirst: true },
  { label: 'Models', appFirst: true },
  { label: 'Models', appFirst: false },
])(
  'opens $label settings instead of Get mobile app; appFirst=$appFirst',
  async ({ label, appFirst }) => {
    vi.useFakeTimers();
    const appTrigger = document.createElement('button');
    appTrigger.setAttribute('aria-haspopup', 'dialog');
    appTrigger.setAttribute('aria-label', 'Get mobile app');
    const appOpened = vi.fn();
    appTrigger.onclick = appOpened;
    const settingsTrigger = document.createElement('button');
    settingsTrigger.setAttribute('aria-haspopup', 'dialog');
    settingsTrigger.setAttribute('aria-label', 'Settings');
    const selected = vi.fn();
    settingsTrigger.onclick = () => {
      queueMicrotask(() => {
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        dialog.dataset.shortcutModal = 'settings';
        const navigation = document.createElement('nav');
        dialog.append(navigation);
        const models = document.createElement('button');
        models.append(document.createElement('svg'), document.createElement('span'));
        models.lastElementChild!.textContent = label;
        models.onclick = selected;
        navigation.append(models);
        document.body.append(dialog);
      });
    };
    document.body.append(
      ...(appFirst ? [appTrigger, settingsTrigger] : [settingsTrigger, appTrigger]),
    );

    openModelsSettings(document);
    await vi.advanceTimersByTimeAsync(1);

    expect(appOpened).not.toHaveBeenCalled();
    expect(selected).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2000);
  },
);

it.each([
  { account: '账号菜单', settings: '设置', models: '模型' },
  { account: 'Account menu', settings: 'Settings', models: 'Models' },
])(
  'uses the native $account > $settings menu without opening Get mobile app',
  async ({ account, settings, models }) => {
    vi.useFakeTimers();
    const app = document.createElement('button');
    app.setAttribute('aria-haspopup', 'dialog');
    app.setAttribute('aria-label', 'Get mobile app');
    const appOpened = vi.fn();
    app.onclick = appOpened;
    const accountButton = document.createElement('button');
    accountButton.setAttribute('aria-label', account);
    accountButton.setAttribute('aria-haspopup', 'menu');
    const selected = vi.fn();
    accountButton.onclick = () => {
      const settingsItem = document.createElement('button');
      settingsItem.setAttribute('role', 'menuitem');
      settingsItem.textContent = settings;
      const shortcut = document.createElement('span');
      shortcut.setAttribute('aria-hidden', 'true');
      shortcut.textContent = 'Ctrl+Alt+,';
      settingsItem.append(shortcut);
      settingsItem.onclick = () => {
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        dialog.dataset.shortcutModal = 'settings';
        const navigation = document.createElement('nav');
        dialog.append(navigation);
        const nav = document.createElement('button');
        nav.append(document.createElement('svg'), document.createElement('span'));
        nav.lastElementChild!.textContent = models;
        nav.onclick = selected;
        navigation.append(nav);
        document.body.append(dialog);
      };
      document.body.append(settingsItem);
    };
    document.body.append(app, accountButton);

    openModelsSettings(document);
    await vi.advanceTimersByTimeAsync(1);

    expect(appOpened).not.toHaveBeenCalled();
    expect(selected).toHaveBeenCalledOnce();
  },
);
