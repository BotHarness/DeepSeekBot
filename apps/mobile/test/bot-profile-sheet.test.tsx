// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
}));

import type { BotProfile } from '../src/host/bot-profile';
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
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  await act(async () => undefined);
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

const full: BotProfile = {
  identity: { status: 'ready', value: profileWire.rpc.memoryFile['SOUL.md'].file.body },
  memory: {
    status: 'ready',
    value: {
      files: profileWire.rpc.memorySnapshot.snapshot.files,
    },
  },
  routines: { status: 'ready', value: profileWire.rpc.scheduleList.schedules as never },
  files: {
    status: 'ready',
    value: profileWire.rpc.grants.grants.filter((grant) => !('revokedAt' in grant)),
  },
};

const empty: BotProfile = {
  identity: { status: 'ready', value: undefined },
  memory: { status: 'ready', value: { files: [] } },
  routines: { status: 'ready', value: [] },
  files: { status: 'ready', value: [] },
};

const actions = () => ({ onMessage: vi.fn(), onNotifications: vi.fn(), onOpenMemory: vi.fn() });
const button = (view: HTMLElement, label: string) =>
  view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const headers = (view: HTMLElement) =>
  [...view.querySelectorAll('[role="header"]')].map((node) => node.textContent);

describe('Bot profile sheet', () => {
  it('shows the identity, persona, memory, routines, Channels and folders', async () => {
    const view = await render(
      <BotProfileSheet
        bot={bot}
        channels={[{ id: 'group-paper-club', name: 'paper-club', memberCount: 1, members: [] }]}
        load={async () => full}
        actions={actions()}
      />,
    );
    expect(headers(view)).toEqual([
      bot.displayName,
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

  it('closes back to the DM, opens notifications and retries a failed section', async () => {
    const handlers = actions();
    let attempt = 0;
    const view = await render(
      <BotProfileSheet
        bot={bot}
        channels={[]}
        load={async () =>
          (attempt += 1) === 1
            ? { ...full, routines: { status: 'failed', error: 'The Host did not answer in time.' } }
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
    const memory = [...view.querySelectorAll('section')][1]!;
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
});
