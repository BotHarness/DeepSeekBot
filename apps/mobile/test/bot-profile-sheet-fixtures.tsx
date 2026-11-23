import { act, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi, type Mock } from 'vitest';
import type { BotProfile } from '../src/host/bot-profile';
import { shiftDay, today as localToday, trailingDays } from '../src/host/usage-days';
import type { ProfileActivity } from '@botharness/host-protocol/wire';
import type { RosterBot } from '@botharness/host-client/client';
import { BotProfilePage } from '../src/ui/chat/bot-profile';
import { createProfileTabMemory, type ProfileTab } from '../src/ui/chat/profile-tabs';
import profileWire from './fixtures/profile-wire.json';
import { navigation } from './bot-profile-sheet-mocks';

export let root: Root | undefined;

let host: HTMLElement | undefined;

export function unmountProfile() {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  vi.useRealTimers();
}

export async function render(element: ReactElement, opened = true): Promise<HTMLElement> {
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

export const bot: RosterBot = {
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

export const week: ProfileActivity = {
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

export const assignments = [
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

export const full: BotProfile = {
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

export const empty: BotProfile = {
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

export const actions = (): {
  onClose: Mock;
  onNotifications: Mock;
  onOpenMemory: Mock;
  onOpenActivity: Mock;
} => ({
  onClose: vi.fn(),
  onNotifications: vi.fn(),
  onOpenMemory: vi.fn(),
  onOpenActivity: vi.fn(),
});

export const button = (view: HTMLElement, label: string) =>
  [...view.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`)].find(
    (node) => node.closest('[hidden]') === null,
  ) ?? null;

export function BotProfileSheet(
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

export const headers = (view: HTMLElement) =>
  [...view.querySelectorAll('[role="header"]')]
    .filter((node) => node.closest('[hidden]') === null)
    .map((node) => node.textContent);

export const avatarNone = {
  pick: async () => undefined,
  save: async () => undefined,
};
