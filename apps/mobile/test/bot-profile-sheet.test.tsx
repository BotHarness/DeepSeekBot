// @vitest-environment jsdom
import { act, createElement, useLayoutEffect, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => {
  const listeners = new Set<(event: { data: { closing: boolean } }) => void>();
  return {
    listeners,
    addListener(_event: string, listener: (event: { data: { closing: boolean } }) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
});
vi.mock('expo-router', () => ({
  useRouter: () => ({ back() {} }),
  useNavigation: () => navigation,
  useFocusEffect: (work: () => () => void) => useLayoutEffect(work, [work]),
}));

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('../src/ui/primitives/system-symbol', () => ({ SystemSymbol: () => null }));
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

import type { BotProfile } from '../src/host/bot-profile';
import { shiftDay, today as localToday, trailingDays } from '../src/host/usage-days';
import type { ProfileActivity } from '../src/host/wire';
import type { RosterBot } from '../src/host/client';
import { BotProfilePage } from '../src/ui/chat/bot-profile';
import { createProfileTabMemory, type ProfileTab } from '../src/ui/chat/profile-tabs';
import { t } from '../src/ui/strings';
import profileWire from './fixtures/profile-wire.json';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  vi.useRealTimers();
});

async function render(element: ReactElement, opened = true): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  await act(async () => undefined);
  if (opened)
    await act(async () => {
      for (const listener of navigation.listeners) listener({ data: { closing: false } });
    });
  return host;
}

const bot: RosterBot = {
  slug: profileWire.bot.slug,
  displayName: profileWire.bot.displayName,
  roles: profileWire.bot.roles,
  description: profileWire.bot.description,
  computerAccess: false,
  browserAccess: false,
  state: 'idle',
  paused: false,
};

const today = trailingDays(localToday(), 1)[0]!;
const week: ProfileActivity = {
  weeks: 1,
  today,
  events: [{ day: today, reason: 'human-dm', count: 4 }],
  memoryCommits: [{ day: shiftDay(today, -2), count: 2 }],
  tokens: [],
  modelUsageRows: [
    {
      day: today,
      purpose: 'orchestrator',
      provider: 'opencode-go',
      model: 'deepseek-v4',
      inputTokens: 300_000,
      outputTokens: 12_000,
      cacheReadTokens: 8000,
      cacheWriteTokens: 0,
      totalTokens: 320_000,
    },
  ],
  modelUsageStatus: 'ready',
};

const assignments = [
  {
    sessionId: 'assignment-1',
    title: 'Summarise the week of papers',
    description: 'Read this week’s papers and send a short digest.',
    activity: 'working' as const,
    latestReport: {
      state: 'progress' as const,
      summary: 'Read 3 of 5',
      at: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  },
];

const full: BotProfile = {
  work: { status: 'ready', value: assignments },
  memory: {
    status: 'ready',
    value: {
      status: 'attached',
      files: profileWire.rpc.memorySnapshot.snapshot.files,
      pinned: [
        { role: 'soul', path: 'SOUL.md', present: true },
        { role: 'coreMemory', path: 'MEMORY.md', present: true },
      ],
    },
  },
  routines: {
    status: 'ready',
    value: profileWire.rpc.scheduleList.schedules as never,
  },
  files: {
    status: 'ready',
    value: profileWire.rpc.grants.grants.filter((grant) => !('revokedAt' in grant)),
  },
  activity: { status: 'ready', value: week },
};

const empty: BotProfile = {
  work: { status: 'ready', value: [] },
  memory: {
    status: 'ready',
    value: {
      status: 'attached',
      files: [],
      pinned: [
        { role: 'soul', path: 'SOUL.md', present: false },
        { role: 'coreMemory', path: 'MEMORY.md', present: false },
      ],
    },
  },
  routines: { status: 'ready', value: [] },
  files: { status: 'ready', value: [] },
  activity: {
    status: 'ready',
    value: {
      ...week,
      events: [],
      memoryCommits: [],
      tokens: [],
      modelUsageRows: [],
    },
  },
};

const actions = () => ({
  onClose: vi.fn(),
  onNotifications: vi.fn(),
  onOpenMemory: vi.fn(),
  onOpenActivity: vi.fn(),
});
const button = (view: HTMLElement, label: string) =>
  view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
function BotProfileSheet(
  props: Omit<Parameters<typeof BotProfilePage>[0], 'tabMemory'> & {
    tab?: ProfileTab;
  },
) {
  const { tab = 'work', ...rest } = props;
  const [memory] = useState(() => {
    const created = createProfileTabMemory({
      read: async () => undefined,
      write() {},
    });
    created.remember('bot', tab);
    return created;
  });
  return <BotProfilePage {...rest} tabMemory={memory} />;
}
const openTab = (view: HTMLElement, tab: ProfileTab) =>
  act(async () =>
    view.querySelector<HTMLButtonElement>(`[data-testid="profile-tab-${tab}"]`)!.click(),
  );
const headers = (view: HTMLElement) =>
  [...view.querySelectorAll('[role="header"]')].map((node) => node.textContent);

describe('Bot profile page', () => {
  const avatarNone = {
    pick: async () => undefined,
    save: async () => undefined,
  };

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

  it('lists the Bot’s Assignments by Title and Description under the day of their last activity', async () => {
    const onOpenAssignment = vi.fn();
    const view = await render(
      <BotProfileSheet
        bot={bot}
        channels={[]}
        load={async () => full}
        actions={{ ...actions(), onOpenAssignment }}
        avatar={avatarNone}
      />,
    );
    const text = view.textContent ?? '';
    expect(text).toContain(t.usageToday);
    expect(text).toContain('Summarise the week of papers');
    expect(text).toContain('Read this week’s papers and send a short digest.');
    expect(text).not.toContain('Read 3 of 5');
    const row = view.querySelector<HTMLButtonElement>(
      '[data-testid="profile-assignment-assignment-1"]',
    )!;
    expect(row.getAttribute('aria-label')).toContain(t.profileAssignmentState.working);
    await act(async () => row.click());
    expect(onOpenAssignment).toHaveBeenCalledWith(assignments[0]);
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
        settings={<span>Full settings</span>}
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

  it('closes, opens notifications and retries a failed section', async () => {
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

    await act(async () => button(view, t.close)!.click());
    await openTab(view, 'settings');
    await act(async () => button(view, t.profileNotifications)!.click());
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    expect(handlers.onNotifications).toHaveBeenCalledTimes(1);
  });

  it('pins SOUL.md and MEMORY.md above a grid of the other Memory files', async () => {
    const handlers = actions();
    const view = await render(
      <BotProfileSheet
        tab="memory"
        avatar={avatarNone}
        bot={bot}
        channels={[]}
        load={async () => full}
        actions={handlers}
      />,
    );
    const entries = [...view.querySelectorAll('button')]
      .map((node) => node.getAttribute('aria-label'))
      .filter((label) => label !== null && !label.startsWith(t.avatarChange));
    const memoryEntries = entries.filter((label) => !label!.startsWith(t.profileTabs.work));
    expect(memoryEntries).toEqual(
      expect.arrayContaining([
        `SOUL.md, ${t.memoryPinned.soul}`,
        `MEMORY.md, ${t.memoryPinned.coreMemory}`,
        `.botharness, ${t.memoryItems(2)}`,
        `notes, ${t.memoryItems(1)}`,
        `.gitattributes, ${t.memoryKind.other}`,
      ]),
    );
    expect(memoryEntries).not.toContain('SOUL.md');
    expect(memoryEntries).not.toContain('MEMORY.md');
    const grid = view.querySelector('[data-testid="memory-pinned"]')!;
    expect(
      grid.compareDocumentPosition(view.querySelector('[data-testid="memory-entry-notes"]')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await act(async () => button(view, `notes, ${t.memoryItems(1)}`)!.click());
    await act(async () => button(view, `SOUL.md, ${t.memoryPinned.soul}`)!.click());
    await act(async () => button(view, `MEMORY.md, ${t.memoryPinned.coreMemory}`)!.click());
    expect(handlers.onOpenMemory.mock.calls).toEqual([
      [{ kind: 'folder', name: 'notes', path: 'notes', count: 1 }],
      [{ kind: 'file', name: 'SOUL.md', path: 'SOUL.md', role: 'soul' }],
      [{ kind: 'file', name: 'MEMORY.md', path: 'MEMORY.md', role: 'coreMemory' }],
    ]);
  });

  it('switches Memory between Files and Changes, lists commits by day and pages older ones', async () => {
    const handlers = { ...actions(), onOpenMemoryChange: vi.fn() };
    const now = new Date();
    const sha = (digit: string) => digit.repeat(40);
    const memoryChanges = vi.fn(async (offset: number) =>
      offset === 0
        ? {
            commits: [
              {
                sha: sha('a'),
                subject: 'Remember the Thursday seminar',
                authoredAt: now.toISOString(),
                status: 'accepted' as const,
              },
              {
                sha: sha('b'),
                subject: 'Edit SOUL.md',
                authoredAt: now.toISOString(),
                status: 'pending' as const,
              },
            ],
            hasMore: true,
          }
        : {
            commits: [
              {
                sha: sha('c'),
                subject: 'Initial Memory',
                authoredAt: '2024-01-02T10:00:00.000Z',
                status: 'accepted' as const,
              },
            ],
            hasMore: false,
          },
    );
    const view = await render(
      <BotProfileSheet
        tab="memory"
        avatar={avatarNone}
        bot={bot}
        channels={[]}
        load={async () => full}
        memoryChanges={memoryChanges}
        actions={handlers}
      />,
    );
    const segment = (label: string) =>
      view.querySelector<HTMLButtonElement>(
        `[data-testid="memory-views"] [role="tab"][aria-label="${label}"]`,
      )!;
    expect(view.querySelector('[data-testid="memory-pinned"]')).not.toBeNull();
    expect(memoryChanges).not.toHaveBeenCalled();

    await act(async () => segment(t.memoryViewChanges).click());
    await act(async () => undefined);
    expect(memoryChanges).toHaveBeenCalledWith(0);
    expect(view.querySelector('[data-testid="memory-pinned"]')).toBeNull();
    expect(view.textContent).toContain(t.usageToday);
    expect(view.textContent).toContain('Remember the Thursday seminar');
    expect(view.textContent).toContain(t.memoryChangeStatus.pending);

    await act(async () =>
      view.querySelector<HTMLButtonElement>(`[data-testid="memory-change-${sha('a')}"]`)!.click(),
    );
    expect(handlers.onOpenMemoryChange).toHaveBeenCalledWith(
      expect.objectContaining({ sha: sha('a') }),
    );

    await act(async () =>
      view.querySelector<HTMLButtonElement>('[data-testid="memory-changes-more"]')!.click(),
    );
    await act(async () => undefined);
    expect(memoryChanges).toHaveBeenLastCalledWith(2);
    expect(view.textContent).toContain('Initial Memory');
    expect(view.querySelector('[data-testid="memory-changes-more"]')).toBeNull();

    await act(async () => segment(t.memoryViewFiles).click());
    expect(view.querySelector('[data-testid="memory-pinned"]')).not.toBeNull();
  });

  it('explains that Memory is not attached, and keeps missing pinned files closed', async () => {
    const handlers = actions();
    const view = await render(
      <BotProfileSheet
        tab="memory"
        avatar={avatarNone}
        bot={bot}
        channels={[]}
        load={async () => ({
          ...full,
          memory: { status: 'ready', value: { status: 'unavailable' } },
        })}
        actions={handlers}
      />,
    );
    expect(view.textContent).toContain(t.memoryNotAttached);
    expect(view.querySelector('[data-testid="memory-pinned"]')).toBeNull();

    act(() => root?.unmount());
    const missing = await render(
      <BotProfileSheet
        tab="memory"
        avatar={avatarNone}
        bot={bot}
        channels={[]}
        load={async () => empty}
        actions={handlers}
      />,
    );
    expect(missing.textContent).toContain(t.profileEmpty.memory);
    await act(async () => button(missing, `SOUL.md, ${t.memoryPinnedMissing}`)!.click());
    expect(handlers.onOpenMemory).not.toHaveBeenCalled();
  });

  it('navigates routines and creation without mounting another sheet', async () => {
    const onOpenRoutine = vi.fn();
    const onNewRoutine = vi.fn();
    const view = await render(
      <BotProfileSheet
        tab="routines"
        avatar={avatarNone}
        bot={bot}
        channels={[]}
        load={async () => full}
        actions={{ ...actions(), onOpenRoutine, onNewRoutine }}
      />,
    );
    const open = [...view.querySelectorAll('button')].find((node) =>
      node.getAttribute('aria-label')?.startsWith(t.routineOpen('Morning digest')),
    )!;
    await act(async () => open.click());
    expect(onOpenRoutine).toHaveBeenCalledWith(profileWire.rpc.scheduleList.schedules[0]);
    expect(headers(view)).toEqual(
      expect.arrayContaining([t.profileTabs.routines, t.routineGroup.daily, t.routineGroup.other]),
    );
    expect(headers(view)).not.toContain(t.routineGroup.weekly);
    expect(
      view.querySelector('[data-testid="profile-routine-group-daily"]')?.textContent,
    ).toContain('Morning digest');
    expect(
      view.querySelector('[data-testid="profile-routine-group-other"]')?.textContent,
    ).toContain('Hourly check');
    await act(async () => button(view, t.routineNew)!.click());
    expect(onNewRoutine).toHaveBeenCalledTimes(1);
    expect(view.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps routines read-only without a Host to change them', async () => {
    const view = await render(
      <BotProfileSheet
        tab="routines"
        avatar={avatarNone}
        bot={bot}
        channels={[]}
        load={async () => full}
        actions={actions()}
      />,
    );
    expect(button(view, t.routineNew)).toBeNull();
    expect(view.textContent).toContain('Morning digest');
    expect(headers(view)).not.toContain(t.profileTabs.routines);
  });

  it('runs a routine from its swipe action and reloads the list', async () => {
    let loads = 0;
    const routines = {
      runNow: vi.fn(async () => ({}) as never),
      setEnabled: vi.fn(async () => ({}) as never),
      remove: vi.fn(async () => undefined),
    };
    const view = await render(
      <BotProfileSheet
        tab="routines"
        avatar={avatarNone}
        bot={bot}
        channels={[]}
        load={async () => {
          loads += 1;
          return full;
        }}
        actions={{ ...actions(), routines }}
      />,
    );
    const before = loads;
    const id = profileWire.rpc.scheduleList.schedules[0]!.id;
    const run = view
      .querySelector(`[data-testid="profile-routine-swipe-${id}"]`)!
      .querySelector<HTMLButtonElement>('[data-testid="swipe-action-run"]')!;
    await act(async () => run.click());
    await act(async () => undefined);
    expect(routines.runNow).toHaveBeenCalledWith(id);
    expect(loads).toBe(before + 1);
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
