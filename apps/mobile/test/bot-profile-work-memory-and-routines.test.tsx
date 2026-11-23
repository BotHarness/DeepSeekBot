// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../src/ui/strings';
import profileWire from './fixtures/profile-wire.json';

const { navigation, alert } = await vi.hoisted(() => import('./bot-profile-sheet-mocks'));

import {
  avatarNone,
  BotProfileSheet,
  actions,
  assignments,
  bot,
  button,
  empty,
  full,
  headers,
  render,
  root,
  unmountProfile,
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

type AlertButton = { text: string; onPress?: () => void };

const pressAlert = (text: string) =>
  act(async () =>
    (alert.mock.calls.at(-1)![2] as AlertButton[]).find((entry) => entry.text === text)!.onPress!(),
  );

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(unmountProfile);

describe('Bot profile page', () => {
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

  it('starts Work with Working now and stops one Session or all of them', async () => {
    const stopper = {
      stopSession: vi.fn(async () => undefined),
      stopBot: vi.fn(async () => undefined),
    };
    const running = {
      ...bot,
      state: 'working' as const,
      sessions: [
        {
          id: 'orch',
          role: 'orchestrator' as const,
          state: 'thinking' as const,
        },
        { id: 'sub', role: 'subagent' as const, state: 'working' as const },
        {
          id: 'assignment-9',
          role: 'assignment' as const,
          name: 'Collect the papers',
          state: 'working' as const,
        },
      ],
    };
    const view = await render(
      <BotProfileSheet
        bot={running}
        channels={[]}
        load={async () => full}
        actions={actions()}
        avatar={avatarNone}
        stopper={stopper}
      />,
    );
    const text = view.textContent ?? '';
    expect(text.indexOf(t.workingNow)).toBeGreaterThanOrEqual(0);
    expect(text.indexOf(t.workingNow)).toBeLessThan(text.indexOf(t.usageToday));
    expect(text.indexOf(t.sessionOrchestrator)).toBeLessThan(text.indexOf('Collect the papers'));
    expect(view.querySelector('[data-testid="working-session-sub"]')).toBeNull();
    await act(async () =>
      view.querySelector<HTMLButtonElement>('[data-testid="working-stop-assignment-9"]')!.click(),
    );
    await pressAlert(t.sessionStop);
    expect(stopper.stopSession).toHaveBeenCalledWith(bot.slug, 'assignment-9');
    expect(
      view.querySelector('[data-testid="working-session-assignment-9"]')?.textContent,
    ).toContain(t.sessionStopping);
    expect(view.querySelector('[data-testid="working-stop-assignment-9-stopping"]')).not.toBeNull();
    await act(async () =>
      view
        .querySelector<HTMLButtonElement>(`[data-testid="working-stop-all-${bot.slug}"]`)!
        .click(),
    );
    await pressAlert(t.sessionStopAll);
    expect(stopper.stopBot).toHaveBeenCalledWith(bot.slug);
    expect(view.querySelector('[data-testid="working-stop-orch-stopping"]')).not.toBeNull();
  });

  it('shows no Working now while the Bot runs nothing', async () => {
    const view = await render(
      <BotProfileSheet
        bot={bot}
        channels={[]}
        load={async () => full}
        actions={actions()}
        avatar={avatarNone}
        stopper={{ stopSession: vi.fn(), stopBot: vi.fn() }}
      />,
    );
    expect(view.textContent).not.toContain(t.workingNow);
    expect(view.textContent).toContain(t.usageToday);
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
      [
        {
          kind: 'file',
          name: 'MEMORY.md',
          path: 'MEMORY.md',
          role: 'coreMemory',
        },
      ],
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
});
