// @vitest-environment jsdom
import { act, createElement, useLayoutEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BotProfile } from '../src/host/bot-profile';
import { type ProfileTab } from '../src/ui/chat/profile-tabs';
import { t } from '../src/ui/strings';
import { profileRootHeader, profileScreenOptions } from '../src/ui/chat/profile-presentation';
import { Platform } from 'react-native';
import { resolveTheme } from '../src/ui/design/resolve-theme';
import profileWire from './fixtures/profile-wire.json';

const { navigation, alert } = await vi.hoisted(() => import('./bot-profile-sheet-mocks'));

import {
  avatarNone,
  BotProfileSheet,
  actions,
  bot,
  button,
  empty,
  full,
  headers,
  render,
  root,
  unmountProfile,
  week,
} from './bot-profile-sheet-fixtures';

vi.mock('expo-router', () => ({
  useIsFocused: () => true,
  useRouter: () => ({ back() {} }),
  useNavigation: () => navigation,
  useFocusEffect: (work: () => () => void) => useLayoutEffect(work, [work]),
}));

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Alert: { alert: (...args: unknown[]) => alert(...args) },
}));

vi.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 96 }));

vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));

vi.mock('react-native-worklets', () => ({
  scheduleOnRN: <A extends unknown[]>(callback: (...args: A) => void, ...args: A) =>
    callback(...args),
}));

vi.mock('react-native-collapsible-tab-view', () => import('./collapsible-tabs-shim'));

vi.mock('../src/ui/chat/header-chrome', () => ({
  HeaderCircleButton: ({
    label,
    testID,
    onPress,
  }: {
    label: string;
    testID?: string;
    onPress(): void;
  }) => <button type="button" data-testid={testID} aria-label={label} onClick={onPress} />,
}));

vi.mock('react-native-keyboard-controller', () => import('./keyboard-controller-shim'));

vi.mock('react-native-reanimated', () => import('./reanimated-shim'));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('expo-image', () => ({ Image: () => null }));

vi.mock('../src/ui/primitives/system-symbol', () => ({
  SystemSymbol: () => null,
}));

vi.mock('expo-haptics', () => import('./expo-haptics-shim'));

vi.mock('../src/ui/bot-avatar', () => ({
  BotAvatar: ({ bot }: { bot: { slug: string } }) =>
    createElement('span', { 'data-testid': `avatar-${bot.slug}` }),
}));

vi.mock('../src/ui/shell/icons', async () => ({
  ...(await import('./shell-icons-shim')),
  ActivityIcon: () => null,
  ChevronRightIcon: () => null,
  FileIcon: () => null,
  FolderIcon: () => null,
  BrowserIcon: () => null,
  ComputerIcon: () => null,
  MessageIcon: () => null,
  PlusIcon: () => null,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(unmountProfile);

it('opens the Bot name editor from the Profile heading', async () => {
  const rename = vi.fn(async () => {});
  const view = await render(
    <BotProfileSheet
      bot={bot}
      channels={[]}
      load={async () => new Promise<BotProfile>(() => {})}
      actions={actions()}
      avatar={{ pick: async () => undefined, save: async () => {} }}
      rename={rename}
    />,
  );
  await act(async () =>
    view.querySelector<HTMLButtonElement>('[data-testid="profile-name-edit"]')!.click(),
  );
  expect(view.querySelector('[data-testid="bot-name-input"]')).not.toBeNull();
});

const openTab = (view: HTMLElement, tab: ProfileTab) =>
  act(async () =>
    view.querySelector<HTMLButtonElement>(`[data-testid="profile-tab-${tab}"]`)!.click(),
  );

describe('Bot profile page', () => {
  it('retains a loaded tab component and its edits when switching away and back', async () => {
    function EditableSettings() {
      const [value, setValue] = useState('');
      return (
        <input
          aria-label="Retained setting"
          value={value}
          onInput={(event) => setValue(event.currentTarget.value)}
        />
      );
    }
    const load = vi.fn(async () => empty);
    const view = await render(
      <BotProfileSheet
        bot={bot}
        channels={[]}
        load={load}
        actions={actions()}
        avatar={avatarNone}
        settings={() => <EditableSettings />}
      />,
    );
    await openTab(view, 'settings');
    const input = view.querySelector<HTMLInputElement>('input[aria-label="Retained setting"]');
    expect(input).not.toBeNull();
    if (input === null) throw new Error('The settings input must be mounted');
    await act(async () => {
      input.value = 'Keep this edit';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await openTab(view, 'work');
    await openTab(view, 'settings');
    expect(view.querySelector('input[aria-label="Retained setting"]')).toBe(input);
    expect(input.value).toBe('Keep this edit');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('lets the Human change the Bot avatar from its portrait and the settings row', async () => {
    const avatar = {
      pick: vi.fn(async () => 'data:image/jpeg;base64,/9j/AA=='),
      save: vi.fn(async () => undefined),
    };
    const view = await render(
      <BotProfileSheet
        tab="settings"
        bot={bot}
        channels={[]}
        load={async () => empty}
        actions={actions()}
        avatar={avatar}
      />,
    );
    const portrait = view.querySelector<HTMLButtonElement>('[data-testid="bot-avatar-change"]');
    expect(portrait !== null).toBe(true);
    await act(async () => portrait!.click());
    expect(avatar.save).toHaveBeenCalledWith('data:image/jpeg;base64,/9j/AA==');
    const row = view.querySelector<HTMLButtonElement>(
      '[data-testid="bot-avatar-settings-change"]',
    )!;
    await act(async () => row.click());
    expect(avatar.pick).toHaveBeenCalledTimes(2);
    expect(avatar.save).toHaveBeenCalledTimes(2);
  });

  it('previews a Profile Banner, retries the same crop, and restores the default from Settings', async () => {
    const image = 'data:image/png;base64,preview';
    const save = vi
      .fn<(_image: string | null) => Promise<void>>()
      .mockRejectedValueOnce(new Error('save refused'))
      .mockResolvedValue(undefined);
    const view = await render(
      <BotProfileSheet
        tab="settings"
        bot={bot}
        channels={[]}
        load={async () => empty}
        actions={actions()}
        avatar={{ pick: async () => undefined, save: async () => {} }}
        banner={{ pick: async () => image, save }}
      />,
    );
    const click = (id: string) =>
      act(async () => view.querySelector<HTMLButtonElement>('[data-testid="' + id + '"]')!.click());
    await click('profile-banner-edit');
    expect(view.querySelector<HTMLButtonElement>('[data-testid="bot-banner-save"]')?.disabled).toBe(
      true,
    );
    await click('bot-banner-pick');
    expect(save).not.toHaveBeenCalled();
    await click('bot-banner-save');
    expect(view.querySelector('[role="alert"]')?.textContent).toContain(t.dialogFailed);
    await click('bot-banner-save');
    expect(save.mock.calls).toEqual([[image], [image]]);
    await click('bot-banner-settings');
    await click('bot-banner-restore');
    expect(save).toHaveBeenLastCalledWith(null);
  });

  it('can remove a custom Bot avatar and recover from a failed save', async () => {
    const avatar = {
      pick: vi.fn(async () => 'data:image/jpeg;base64,/9j/AA=='),
      save: vi
        .fn<(_avatar: string | null) => Promise<void>>()
        .mockRejectedValueOnce(new Error('save refused'))
        .mockResolvedValueOnce(undefined),
    };
    const view = await render(
      <BotProfileSheet
        tab="settings"
        bot={{ ...bot, avatarUrl: 'https://example.test/avatar.jpg' }}
        channels={[]}
        load={async () => empty}
        actions={actions()}
        avatar={avatar}
      />,
    );
    const portrait = view.querySelector<HTMLButtonElement>('[data-testid="bot-avatar-change"]');
    await act(async () => portrait!.click());
    expect(view.querySelector('[role="alert"]')?.textContent).toContain('save refused');
    const remove = view.querySelector<HTMLButtonElement>(
      '[data-testid="bot-avatar-settings-remove"]',
    )!;
    await act(async () => remove.click());
    expect(avatar.save).toHaveBeenLastCalledWith(null);
    expect(view.querySelector('[role="alert"]')).toBeNull();
  });

  it('opens with five icon tabs named for VoiceOver and TalkBack, no tab-name heading and no Share or Message', async () => {
    const view = await render(
      <BotProfileSheet
        bot={bot}
        channels={[]}
        load={async () => full}
        actions={actions()}
        avatar={avatarNone}
      />,
    );
    const tabs = [...view.querySelectorAll('[role="tab"]')];
    expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual([
      t.profileTabs.work,
      t.profileTabs.memory,
      t.profileTabs.files,
      t.profileTabs.routines,
      t.profileTabs.settings,
    ]);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
    ]);
    expect(tabs.every((tab) => tab.textContent === '')).toBe(true);
    expect(view.querySelector('[data-testid="profile-tab-content-work"]')).not.toBeNull();
    expect(headers(view)).not.toContain(t.profileTabs.work);
    expect(button(view, 'Message')).toBeNull();
    expect(button(view, t.share.title)).toBeNull();
    await openTab(view, 'routines');
    expect(view.querySelector('[data-testid="profile-tab-content-routines"]')).not.toBeNull();
    expect(
      view.querySelector('[data-testid="profile-tab-routines"]')?.getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('pushes in like a page from the right with a Back button instead of a sheet handle', async () => {
    const options = profileScreenOptions(resolveTheme('light', {}, 'ios'));
    expect(options).toMatchObject({
      headerShown: false,
      presentation: 'card',
      animation: 'slide_from_right',
      gestureEnabled: true,
      fullScreenGestureEnabled: false,
    });
    expect(options).not.toHaveProperty('sheetAllowedDetents');
    expect(profileRootHeader('index')).toBeUndefined();
    const os = Platform.OS;
    Object.assign(Platform, { OS: 'ios' });
    try {
      expect(profileScreenOptions(resolveTheme('light', {}, 'ios'))).toMatchObject({
        headerShown: true,
        headerTransparent: true,
        title: '',
        presentation: 'card',
        animation: 'default',
      });
      expect(profileRootHeader('index')).toEqual({ headerShown: true });
      expect(profileRootHeader('memory')).toEqual({ headerShown: false });
    } finally {
      Object.assign(Platform, { OS: os });
    }
    const onClose = vi.fn();
    const view = await render(
      <BotProfileSheet
        bot={bot}
        channels={[]}
        load={async () => full}
        actions={{ ...actions(), onClose }}
        avatar={avatarNone}
      />,
    );
    expect(view.querySelector('[data-testid="profile-handle"]')).toBeNull();
    const back = view.querySelector('[data-testid="profile-back"]') as HTMLElement;
    expect(back.getAttribute('aria-label')).toBe(t.back);
    await act(async () => back.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('places Permissions between the overview and the Bot settings', async () => {
    const view = await render(
      <BotProfileSheet
        tab="settings"
        avatar={avatarNone}
        bot={bot}
        channels={[]}
        initialProfile={empty}
        load={async () => empty}
        permissions={<span data-testid="permissions-rows">Workspace grants</span>}
        actions={actions()}
      />,
    );
    const order = headers(view);
    const permissions = order.indexOf(t.approvals.permissions);
    expect(permissions).toBeGreaterThan(-1);
    expect(order.indexOf(t.profileSettingsBot)).toBeGreaterThan(permissions);
    expect(view.querySelector('[data-testid="permissions-rows"]')).not.toBeNull();
  });

  it('opens a lightweight shell before data resolves and keeps cached content during refresh', async () => {
    const request = Promise.withResolvers<BotProfile>();
    const view = await render(
      <BotProfileSheet
        tab="settings"
        avatar={avatarNone}
        bot={bot}
        channels={[]}
        initialProfile={full}
        load={() => request.promise}
        settings={() => <span>Full settings</span>}
        actions={actions()}
      />,
      false,
    );
    expect(headers(view)).toContain(bot.displayName);
    expect(view.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(view.textContent).not.toContain('Full settings');
    await act(async () => {
      for (const listener of navigation.listeners) listener({ data: { closing: false } });
    });
    expect(view.textContent).toContain('Full settings');
    await openTab(view, 'memory');
    const notes = '[data-testid="memory-entry-notes"]';
    expect(view.querySelector(notes)).not.toBeNull();
    await act(async () => request.resolve(empty));
    expect(view.querySelector(notes)).toBeNull();
    expect(view.textContent).toContain(t.memoryPinnedMissing);
  });

  it('moves the identity, memory, routines, Channels and folders into their tabs', async () => {
    const view = await render(
      <BotProfileSheet
        tab="memory"
        avatar={avatarNone}
        bot={bot}
        channels={[
          {
            id: 'group-paper-club',
            name: 'paper-club',
            memberCount: 1,
            members: [],
          },
        ]}
        load={async () => full}
        actions={actions()}
      />,
    );
    expect(view.textContent).toContain(profileWire.bot.description);
    expect(view.textContent).toContain('researcher');
    expect(view.textContent).not.toContain('Standing rules:');
    expect(headers(view)).toEqual([bot.displayName]);
    expect(view.textContent?.split(bot.displayName)).toHaveLength(2);
    await openTab(view, 'routines');
    expect(view.textContent).toContain('Morning digest');
    expect(view.textContent).toContain(t.routineDaily('09:00'));
    expect(view.textContent).toContain(t.routineEvery(3600));
    await openTab(view, 'settings');
    expect(headers(view)).toEqual([
      bot.displayName,
      t.profileSettingsBot,
      t.avatarTitle,
      t.profileSection.channels,
      t.profileSection.files,
    ]);
    expect(view.textContent).toContain('# paper-club');
    expect(view.textContent).toContain(`${t.folderReadOnly} · /Users/me/Documents/papers`);
    expect(view.textContent).not.toContain('/Users/me/Documents/old');
  });

  it('says so when a section is empty, and offers Browser and Computer only when the Bot has them', async () => {
    const view = await render(
      <BotProfileSheet
        bot={bot}
        channels={[]}
        load={async () => empty}
        actions={actions()}
        avatar={avatarNone}
      />,
    );
    let text = '';
    for (const tab of ['work', 'memory', 'routines', 'settings'] as const) {
      await openTab(view, tab);
      text += view.textContent ?? '';
    }
    for (const note of Object.values(t.profileEmpty)) expect(text).toContain(note);
    expect(button(view, t.profileComputer)).toBeNull();
    expect(button(view, t.profileBrowser)).toBeNull();

    act(() => root?.unmount());
    const onComputer = vi.fn();
    const withComputer = await render(
      <BotProfileSheet
        avatar={avatarNone}
        bot={{ ...bot, computerAccess: true }}
        channels={[]}
        load={async () => empty}
        actions={{ ...actions(), onComputer }}
      />,
    );
    await act(async () => button(withComputer, t.profileComputer)!.click());
    expect(onComputer).toHaveBeenCalled();

    act(() => root?.unmount());
    const onBrowser = vi.fn();
    const withBrowser = await render(
      <BotProfileSheet
        avatar={avatarNone}
        bot={{ ...bot, browserAccess: true }}
        channels={[]}
        load={async () => empty}
        actions={{ ...actions(), onBrowser }}
      />,
    );
    await act(async () => button(withBrowser, t.profileBrowser)!.click());
    expect(onBrowser).toHaveBeenCalled();
  });

  it('reveals cached sections when an initial entry has no opening transition event', async () => {
    vi.useFakeTimers();
    const view = await render(
      <BotProfileSheet
        tab="routines"
        avatar={avatarNone}
        bot={bot}
        channels={[]}
        load={async () => full}
        actions={actions()}
      />,
      false,
    );
    expect(view.textContent).not.toContain('Morning digest');
    await act(async () => vi.advanceTimersByTime(600));
    expect(view.textContent).toContain('Morning digest');
  });

  it('opens notifications and retries a failed section', async () => {
    const handlers = actions();
    let attempt = 0;
    const view = await render(
      <BotProfileSheet
        tab="routines"
        avatar={avatarNone}
        bot={bot}
        channels={[]}
        load={async () =>
          (attempt += 1) === 1
            ? {
                ...full,
                routines: {
                  status: 'failed',
                  error: 'The Host did not answer in time.',
                },
              }
            : full
        }
        actions={handlers}
      />,
    );
    expect(view.textContent).toContain(t.profileFailed);
    expect(view.textContent).not.toContain('The Host did not answer in time.');
    await act(async () =>
      [...view.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === t.details)!
        .click(),
    );
    expect(view.textContent).toContain('The Host did not answer in time.');
    await act(async () => button(view, t.tryAgain)!.click());
    await act(async () => undefined);
    expect(view.textContent).toContain('Morning digest');

    await openTab(view, 'settings');
    await act(async () => button(view, t.profileNotifications)!.click());
    expect(handlers.onNotifications).toHaveBeenCalledTimes(1);
  });

  it('shows the last 7 days first in Settings and opens the Activity screen', async () => {
    const handlers = actions();
    const view = await render(
      <BotProfileSheet
        tab="settings"
        avatar={avatarNone}
        bot={bot}
        channels={[]}
        load={async () => full}
        actions={handlers}
      />,
    );
    const glance = view.querySelector<HTMLButtonElement>(
      `button[aria-label^="${t.activityHeading}"]`,
    )!;
    expect(glance.textContent).toContain(t.activityTokens('320K'));
    expect(glance.textContent).toContain(t.activityCount(6));
    expect(glance.querySelectorAll('[role="image"]')).toHaveLength(2);
    expect(glance.textContent).not.toContain(t.activityQuiet);
    await act(async () => glance.click());
    expect(handlers.onOpenActivity).toHaveBeenCalledTimes(1);
  });

  it('formats reported partial usage like global Settings without a partial-known label', async () => {
    const partial = {
      ...full,
      activity: {
        status: 'ready' as const,
        value: {
          ...week,
          modelUsageRows: [{ ...week.modelUsageRows[0]!, totalTokens: 674655, partial: true }],
        },
      },
    };
    const view = await render(
      <BotProfileSheet
        tab="settings"
        avatar={avatarNone}
        bot={bot}
        channels={[]}
        load={async () => partial}
        actions={actions()}
      />,
    );
    const glance = view.querySelector<HTMLButtonElement>(
      `button[aria-label^="${t.activityHeading}"]`,
    )!;
    expect(glance.textContent).toContain(t.activityTokens('674.7K+'));
    expect(glance.textContent).not.toContain(t.activityPartialCount('674.7K'));
  });

  it('shows a quiet week for a Bot with no activity, and Try again when the call fails', async () => {
    const quiet = await render(
      <BotProfileSheet
        tab="settings"
        avatar={avatarNone}
        bot={bot}
        channels={[]}
        load={async () => empty}
        actions={actions()}
      />,
    );
    expect(quiet.textContent).toContain(t.activityTokens('0'));
    expect(quiet.textContent).toContain(t.activityQuiet);
    act(() => root?.unmount());

    let attempt = 0;
    const failed = await render(
      <BotProfileSheet
        tab="settings"
        avatar={avatarNone}
        bot={bot}
        channels={[]}
        load={async () =>
          (attempt += 1) === 1
            ? {
                ...full,
                activity: { status: 'failed', error: 'Unknown PersonaBot' },
              }
            : full
        }
        actions={actions()}
      />,
    );
    expect(failed.textContent).toContain(t.profileFailed);
    await act(async () =>
      [...failed.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === t.details)!
        .click(),
    );
    expect(failed.textContent).toContain('Unknown PersonaBot');
    await act(async () => button(failed, t.tryAgain)!.click());
    await act(async () => undefined);
    expect(failed.textContent).toContain(t.activityTokens('320K'));
  });
});
