// @vitest-environment jsdom
import { act, createElement, useLayoutEffect, type ReactElement } from 'react';
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
vi.mock('../src/ui/bot-avatar', () => ({
  BotAvatar: ({ bot }: { bot: { slug: string } }) =>
    createElement('span', { 'data-testid': `avatar-${bot.slug}` }),
}));
vi.mock('../src/ui/shell/icons', () => ({
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
import { BotProfileSheet } from '../src/ui/chat/bot-profile';
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

const full: BotProfile = {
  identity: {
    status: 'ready',
    value: profileWire.rpc.memoryFile['SOUL.md'].file.body,
  },
  memory: {
    status: 'ready',
    value: {
      files: profileWire.rpc.memorySnapshot.snapshot.files,
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
  identity: { status: 'ready', value: undefined },
  memory: { status: 'ready', value: { files: [] } },
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
  onMessage: vi.fn(),
  onNotifications: vi.fn(),
  onOpenMemory: vi.fn(),
  onOpenActivity: vi.fn(),
});
const button = (view: HTMLElement, label: string) =>
  view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const headers = (view: HTMLElement) =>
  [...view.querySelectorAll('[role="header"]')].map((node) => node.textContent);

describe('Bot profile sheet', () => {
  it('opens a lightweight shell before data resolves and keeps cached content during refresh', async () => {
    const request = Promise.withResolvers<BotProfile>();
    const view = await render(
      <BotProfileSheet
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
    expect(view.textContent).toContain('Standing rules:');
    await act(async () => request.resolve(empty));
    expect(view.textContent).not.toContain('Standing rules:');
  });

  it('shows the identity, persona, memory, routines, Channels and folders', async () => {
    const view = await render(
      <BotProfileSheet
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
    expect(headers(view)).toEqual([
      bot.displayName,
      t.profileSection.activity,
      t.profileSection.identity,
      t.profileSection.memory,
      t.profileSection.routines,
      t.profileSection.channels,
      t.profileSection.files,
    ]);
    const text = view.textContent ?? '';
    expect(text).toContain(profileWire.bot.description);
    expect(text).toContain('researcher');
    expect(text).toContain('Standing rules:');
    expect(text).not.toContain('Vain prefers summaries under 100 words.');
    expect(text).not.toContain('reading.md');
    expect(text).toContain('Morning digest');
    expect(text).toContain(t.routineDaily('09:00'));
    expect(text).toContain(t.routineEvery(3600));
    expect(text).toContain('# paper-club');
    expect(text).toContain(`${t.folderReadOnly} · /Users/me/Documents/papers`);
    expect(text).not.toContain('/Users/me/Documents/old');
  });

  it('says so when a section is empty, and offers Browser and Computer only when the Bot has them', async () => {
    const view = await render(
      <BotProfileSheet bot={bot} channels={[]} load={async () => empty} actions={actions()} />,
    );
    const text = view.textContent ?? '';
    for (const note of Object.values(t.profileEmpty)) expect(text).toContain(note);
    expect(button(view, t.profileComputer)).toBeNull();
    expect(button(view, t.profileBrowser)).toBeNull();

    act(() => root?.unmount());
    const onComputer = vi.fn();
    const withComputer = await render(
      <BotProfileSheet
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
      <BotProfileSheet bot={bot} channels={[]} load={async () => full} actions={actions()} />,
      false,
    );
    expect(view.textContent).not.toContain('Morning digest');
    await act(async () => vi.advanceTimersByTime(600));
    expect(view.textContent).toContain('Morning digest');
  });

  it('closes back to the DM, opens notifications and retries a failed section', async () => {
    const handlers = actions();
    let attempt = 0;
    const view = await render(
      <BotProfileSheet
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
    expect(view.textContent).toContain(`${t.profileFailed} The Host did not answer in time.`);
    await act(async () => button(view, t.tryAgain)!.click());
    await act(async () => undefined);
    expect(view.textContent).toContain('Morning digest');

    await act(async () => button(view, t.profileMessage)!.click());
    await act(async () => button(view, t.profileNotifications)!.click());
    expect(handlers.onMessage).toHaveBeenCalledTimes(1);
    expect(handlers.onNotifications).toHaveBeenCalledTimes(1);
  });

  it('lists the top of the Memory tree and opens a folder or a file', async () => {
    const handlers = actions();
    const view = await render(
      <BotProfileSheet bot={bot} channels={[]} load={async () => full} actions={handlers} />,
    );
    const memory = [...view.querySelectorAll('section')][2]!;
    expect(
      [...memory.querySelectorAll('button')].map((node) => node.getAttribute('aria-label')),
    ).toEqual([
      `.botharness, ${t.memoryItems(2)}`,
      `notes, ${t.memoryItems(1)}`,
      '.gitattributes',
      'MEMORY.md',
      'SOUL.md',
    ]);
    await act(async () => button(view, `notes, ${t.memoryItems(1)}`)!.click());
    await act(async () => button(view, 'MEMORY.md')!.click());
    expect(handlers.onOpenMemory.mock.calls).toEqual([
      [{ kind: 'folder', name: 'notes', path: 'notes', count: 1 }],
      [{ kind: 'file', name: 'MEMORY.md', path: 'MEMORY.md' }],
    ]);
  });

  it('navigates routines and creation without mounting another sheet', async () => {
    const onOpenRoutine = vi.fn();
    const onNewRoutine = vi.fn();
    const view = await render(
      <BotProfileSheet
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
    await act(async () => button(view, t.routineNew)!.click());
    expect(onNewRoutine).toHaveBeenCalledTimes(1);
    expect(view.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps routines read-only without a Host to change them', async () => {
    const view = await render(
      <BotProfileSheet bot={bot} channels={[]} load={async () => full} actions={actions()} />,
    );
    expect(button(view, t.routineNew)).toBeNull();
    expect(view.textContent).toContain('Morning digest');
  });

  it('shows the last 7 days and opens the Activity screen', async () => {
    const handlers = actions();
    const view = await render(
      <BotProfileSheet bot={bot} channels={[]} load={async () => full} actions={handlers} />,
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
      <BotProfileSheet bot={bot} channels={[]} load={async () => partial} actions={actions()} />,
    );
    const glance = view.querySelector<HTMLButtonElement>(
      `button[aria-label^="${t.activityHeading}"]`,
    )!;
    expect(glance.textContent).toContain(t.activityTokens('674.7K+'));
    expect(glance.textContent).not.toContain(t.activityPartialCount('674.7K'));
  });

  it('shows a quiet week for a Bot with no activity, and Try again when the call fails', async () => {
    const quiet = await render(
      <BotProfileSheet bot={bot} channels={[]} load={async () => empty} actions={actions()} />,
    );
    expect(quiet.textContent).toContain(t.activityTokens('0'));
    expect(quiet.textContent).toContain(t.activityQuiet);
    act(() => root?.unmount());

    let attempt = 0;
    const failed = await render(
      <BotProfileSheet
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
    expect(failed.textContent).toContain(`${t.profileFailed} Unknown PersonaBot`);
    expect(failed.textContent).toContain('Morning digest');
    await act(async () => button(failed, t.tryAgain)!.click());
    await act(async () => undefined);
    expect(failed.textContent).toContain(t.activityTokens('320K'));
  });
});
