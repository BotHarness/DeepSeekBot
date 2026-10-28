// @vitest-environment jsdom
import { act, createElement, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const alert = vi.fn();
vi.mock('expo-router', async () => {
  const { useLayoutEffect } = await import('react');
  return {
    useIsFocused: () => true,
    useRouter: () => ({ back() {} }),
    useNavigation: () => ({ addListener: () => () => {} }),
    useFocusEffect: (work: () => () => void) => useLayoutEffect(work, [work]),
  };
});
vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('../src/ui/primitives/system-symbol', () => ({ SystemSymbol: () => null }));
vi.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 96 }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Alert: { alert: (...args: unknown[]) => alert(...args) },
}));
vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));
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
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('../src/ui/bot-avatar', () => ({
  BotAvatar: ({ bot }: { bot: { slug: string } }) =>
    createElement('span', { 'data-testid': `avatar-${bot.slug}` }),
}));
vi.mock('../src/ui/shell/icons', async () => ({
  ...(await import('./shell-icons-shim')),
  ChevronRightIcon: () => null,
  MoreIcon: () => null,
  PlusIcon: () => null,
}));
vi.mock('../src/ui/chat/sheet', () => {
  const pass = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
  return {
    SHEET_GROUP: 'raised',
    Sheet: ({
      visible,
      label,
      children,
      onClose,
    }: {
      visible: boolean;
      label: string;
      children: ReactNode;
      onClose(): void;
    }) =>
      visible
        ? createElement(
            'div',
            { role: 'dialog', 'aria-label': label },
            createElement('button', { 'aria-label': 'dismiss-sheet', onClick: onClose }),
            children,
          )
        : null,
    SheetActions: pass,
    SheetNote: pass,
    SheetCallout: ({ children }: { children: ReactNode }) =>
      createElement('div', { role: 'alert' }, children),
  };
});

import type { ProfileAssignment } from '../src/host/bot-profile';
import type { RosterBot } from '../src/host/client';
import type { GroupActions, GroupInfo } from '../src/host/group-channel';
import { GroupProfilePage, type GroupProfileProps } from '../src/ui/chat/group-info';
import {
  createProfileTabMemory,
  type ProfileTab,
  type ProfileTabMemory,
} from '../src/ui/chat/profile-tabs';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
beforeEach(() => alert.mockReset());
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
  return host;
}

const bot = (slug: string, displayName: string): RosterBot => ({
  slug,
  displayName,
  roles: [],
  computerAccess: false,
  browserAccess: false,
  state: 'idle',
  paused: false,
});
const ada = bot('ada', 'Ada');
const bo = bot('bo', 'Bo');
const cy = bot('cy', 'Cy');
const di = bot('di', 'Di');

const info: GroupInfo = {
  channel: { id: 'g1', name: 'Launch', memberCount: 2, members: ['ada', 'bo'] },
  members: [
    { slug: 'ada', bot: ada, owner: true },
    { slug: 'bo', bot: bo, owner: false },
  ],
  invites: [{ id: 'inv-1', slug: 'cy', bot: cy }],
  joins: [{ id: 'join-1', slug: 'di', bot: di }],
  candidates: [bot('fay', 'Fay')],
};

function actions(overrides: Partial<GroupActions> = {}): GroupActions {
  return {
    invite: vi.fn(async () => undefined),
    cancelInvite: vi.fn(async () => undefined),
    decideJoin: vi.fn(async () => undefined),
    removeMember: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    setAvatar: vi.fn(async () => undefined),
    disband: vi.fn(async () => undefined),
    ...overrides,
  };
}

const button = (view: ParentNode, label: string) =>
  [...view.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`)].find(
    (node) => node.closest('[hidden]') === null,
  ) ?? null;

type AlertButton = { text: string; style?: string; onPress?: () => void };
const pressAlert = (call: number, text: string) =>
  act(async () =>
    (alert.mock.calls[call]![2] as AlertButton[]).find((entry) => entry.text === text)!.onPress!(),
  );

function tabMemory(tab?: ProfileTab): ProfileTabMemory {
  const memory = createProfileTabMemory({ read: async () => undefined, write() {} });
  if (tab !== undefined) memory.remember('group', tab);
  return memory;
}

function sheet(overrides: Partial<GroupProfileProps> = {}, tab?: ProfileTab): GroupProfileProps {
  return {
    info,
    actions: actions(),
    pickAvatar: vi.fn(async () => undefined),
    onOpenBot: vi.fn(),
    onDisbanded: vi.fn(),
    onClose: vi.fn(),
    tabMemory: tabMemory(tab),
    ...overrides,
  };
}

const showTab = (props: GroupProfileProps, tab: ProfileTab) =>
  act(async () => props.tabMemory.remember('group', tab));

describe('Group profile', () => {
  it('lets the Human replace the photo by pressing the large Channel avatar', async () => {
    const props = sheet({ pickAvatar: vi.fn(async () => 'data:image/jpeg;base64,/9j/AA==') });
    const view = await render(<GroupProfilePage {...props} />);
    const avatar = view.querySelector<HTMLButtonElement>('[data-testid="group-avatar-change"]');
    expect(avatar).not.toBeNull();
    expect(avatar?.getAttribute('aria-label')).toBe(t.avatarChange);
    await act(async () => avatar!.click());
    expect(props.pickAvatar).toHaveBeenCalledOnce();
    expect(props.actions.setAvatar).toHaveBeenCalledWith('data:image/jpeg;base64,/9j/AA==');
  });

  it('keeps the current photo when picking is cancelled and allows another attempt', async () => {
    const props = sheet();
    const view = await render(<GroupProfilePage {...props} />);
    const avatar = view.querySelector<HTMLButtonElement>('[data-testid="group-avatar-change"]')!;
    await act(async () => avatar.click());
    expect(props.actions.setAvatar).toHaveBeenCalledTimes(0);
    expect(view.querySelector('[role="alert"]')).toBeNull();
    expect(avatar.disabled).toBe(false);
    await act(async () => avatar.click());
    expect(props.pickAvatar).toHaveBeenCalledTimes(2);
  });

  it('prevents repeat picks until the selected photo has finished saving', async () => {
    const picking = Promise.withResolvers<string | undefined>();
    const saving = Promise.withResolvers<void>();
    const props = sheet({
      pickAvatar: vi.fn(() => picking.promise),
      actions: actions({ setAvatar: vi.fn(() => saving.promise) }),
    });
    const view = await render(<GroupProfilePage {...props} />);
    const avatar = view.querySelector<HTMLButtonElement>('[data-testid="group-avatar-change"]')!;
    await act(async () => {
      avatar.click();
      avatar.click();
    });
    expect(props.pickAvatar).toHaveBeenCalledOnce();
    expect(avatar.disabled).toBe(true);
    await act(async () => picking.resolve('data:image/jpeg;base64,/9j/AA=='));
    expect(props.actions.setAvatar).toHaveBeenCalledOnce();
    expect(avatar.disabled).toBe(true);
    await act(async () => saving.resolve());
    expect(avatar.disabled).toBe(false);
  });

  it('shows picker failures and lets the Human try again', async () => {
    const pickAvatar = vi
      .fn<() => Promise<string | undefined>>()
      .mockRejectedValueOnce(new Error('picker failed'))
      .mockResolvedValueOnce('data:image/jpeg;base64,/9j/AA==');
    const props = sheet({ pickAvatar });
    const view = await render(<GroupProfilePage {...props} />);
    const avatar = view.querySelector<HTMLButtonElement>('[data-testid="group-avatar-change"]')!;
    await act(async () => avatar.click());
    expect(view.querySelector('[role="alert"]')?.textContent).toBe(t.avatarPickFailed);
    expect(props.actions.setAvatar).toHaveBeenCalledTimes(0);
    await act(async () => avatar.click());
    expect(view.querySelector('[role="alert"]')).toBeNull();
    expect(props.actions.setAvatar).toHaveBeenCalledWith('data:image/jpeg;base64,/9j/AA==');
  });

  it('shows photo save failures and enables retry', async () => {
    const props = sheet({
      pickAvatar: vi.fn(async () => 'data:image/jpeg;base64,/9j/AA=='),
      actions: actions({
        setAvatar: vi.fn(async () => {
          throw new Error('save failed');
        }),
      }),
    });
    const view = await render(<GroupProfilePage {...props} />);
    const avatar = view.querySelector<HTMLButtonElement>('[data-testid="group-avatar-change"]')!;
    await act(async () => avatar.click());
    expect(view.querySelector('[role="alert"]')?.textContent).toBe(
      `${t.avatarSaveFailed} save failed`,
    );
    expect(avatar.disabled).toBe(false);
  });

  it('lists the members, the creator, pending invitations and join requests', async () => {
    const view = await render(<GroupProfilePage {...sheet()} />);
    const text = view.textContent ?? '';
    expect(text).toContain('Launch');
    expect(text).toContain(t.members(2));
    expect(text).toContain(t.groupOwner);
    expect(text).toContain(t.groupInvited);
    expect(text).toContain(t.groupJoinAsk);
    const headers = [...view.querySelectorAll('[role="header"]')]
      .filter((node) => node.closest('[hidden]') === null)
      .map((node) => node.textContent);
    expect(headers).toEqual(['Launch', t.groupJoinsSection, t.groupMembersSection]);
    for (const slug of ['ada', 'bo', 'cy', 'di'])
      expect(view.querySelector(`[data-testid="avatar-${slug}"]`)).not.toBeNull();
    expect(button(view, t.groupInvite)).not.toBeNull();
  });

  it('opens a member profile, cancels an invitation and decides a join request', async () => {
    const props = sheet();
    const view = await render(<GroupProfilePage {...props} />);
    await act(async () => button(view, 'Bo')!.click());
    expect(props.onOpenBot).toHaveBeenCalledWith('bo');

    await act(async () => button(view, t.groupInviteCancel)!.click());
    expect(props.actions.cancelInvite).toHaveBeenCalledWith('inv-1');

    await act(async () => button(view, t.groupJoinAllow)!.click());
    expect(props.actions.decideJoin).toHaveBeenCalledWith('join-1', true);
    await act(async () => button(view, t.groupJoinDecline)!.click());
    expect(props.actions.decideJoin).toHaveBeenCalledWith('join-1', false);
  });

  it('invites a PersonaBot that is not in the group yet', async () => {
    const props = sheet();
    const view = await render(<GroupProfilePage {...props} />);
    await act(async () => button(view, t.groupInvite)!.click());
    const dialog = view.querySelector(`[role="dialog"][aria-label="${t.groupInvite}"]`)!;
    expect(dialog.textContent).toContain('Fay');
    await act(async () => button(dialog, 'Fay')!.click());
    expect(props.actions.invite).toHaveBeenCalledWith('fay');
  });

  for (const settles of ['success', 'failure'] as const) {
    it(`does not dismiss a replacement sheet after an old invitation ${settles}`, async () => {
      let resolve!: () => void;
      let reject!: (failure: Error) => void;
      const pending = new Promise<void>((done, fail) => {
        resolve = done;
        reject = fail;
      });
      const props = sheet({ actions: actions({ invite: vi.fn(() => pending) }) });
      const view = await render(<GroupProfilePage {...props} />);
      await act(async () => button(view, t.groupInvite)!.click());
      const invite = view.querySelector(`[role="dialog"][aria-label="${t.groupInvite}"]`)!;
      await act(async () => button(invite, 'Fay')!.click());
      await act(async () => button(invite, 'dismiss-sheet')!.click());
      await showTab(props, 'settings');
      await act(async () => button(view, `${t.groupRename}, Launch`)!.click());
      expect(view.querySelector(`textarea[aria-label="${t.groupName}"]`)).not.toBeNull();
      await act(async () => {
        if (settles === 'success') resolve();
        else reject(new Error('old invitation failed'));
      });
      expect(view.querySelector(`textarea[aria-label="${t.groupName}"]`)).not.toBeNull();
      expect(view.textContent).not.toContain('old invitation failed');
    });
  }

  it('removes a member only after the confirmation', async () => {
    const props = sheet();
    const view = await render(<GroupProfilePage {...props} />);
    const menu = button(view, t.groupMemberMenu('Bo'))!;
    expect(menu.parentElement?.closest('button')).toBeNull();
    await act(async () => menu.click());
    expect(props.onOpenBot).not.toHaveBeenCalled();
    await pressAlert(0, t.groupRemove);
    expect(props.actions.removeMember).not.toHaveBeenCalled();
    expect(alert.mock.calls[1]![0]).toBe(t.groupRemoveConfirm('Bo'));
    await pressAlert(1, t.groupRemove);
    expect(props.actions.removeMember).toHaveBeenCalledWith('bo');
  });

  it('renames the group and sets the photo the Human picked', async () => {
    const props = sheet(
      { pickAvatar: vi.fn(async () => 'data:image/jpeg;base64,/9j/AA==') },
      'settings',
    );
    const view = await render(<GroupProfilePage {...props} />);
    await act(async () => button(view, `${t.groupRename}, Launch`)!.click());
    const field = view.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${t.groupName}"]`)!;
    expect(button(view, t.groupRenameSave)!.disabled).toBe(true);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(field, 'Launch crew');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button(view, t.groupRenameSave)!.click());
    expect(props.actions.rename).toHaveBeenCalledWith('Launch crew');

    const photoRow = view.querySelectorAll<HTMLButtonElement>(
      `button[aria-label="${t.avatarChange}"]`,
    )[1]!;
    await act(async () => photoRow.click());
    expect(props.actions.setAvatar).toHaveBeenCalledWith('data:image/jpeg;base64,/9j/AA==');
    expect(button(view, t.avatarRemove)).toBeNull();
  });

  it('shows the Host refusal as a notice and keeps the page', async () => {
    const props = sheet({
      actions: actions({
        cancelInvite: vi.fn(async () => {
          throw new Error('Invitation is no longer pending');
        }),
      }),
    });
    const view = await render(<GroupProfilePage {...props} />);
    await act(async () => button(view, t.groupInviteCancel)!.click());
    expect(view.querySelector('[role="alert"]')?.textContent).toBe(
      `${t.groupFailed} Invitation is no longer pending`,
    );
    expect(view.textContent).toContain(t.groupMembersSection);
  });

  it('disbands only after the confirmation and then leaves the page', async () => {
    const props = sheet({}, 'settings');
    const view = await render(<GroupProfilePage {...props} />);
    await act(async () => button(view, t.groupDisband)!.click());
    expect(alert.mock.calls[0]![0]).toBe(t.groupDisbandConfirm('Launch'));
    expect(props.actions.disband).not.toHaveBeenCalled();
    await pressAlert(0, t.groupDisband);
    expect(props.actions.disband).toHaveBeenCalled();
    expect(props.onDisbanded).toHaveBeenCalled();
  });

  it('stays on the page when disbanding fails', async () => {
    const props = sheet(
      {
        actions: actions({
          disband: vi.fn(async () => {
            throw new Error('The group was not disbanded.');
          }),
        }),
      },
      'settings',
    );
    const view = await render(<GroupProfilePage {...props} />);
    await act(async () => button(view, t.groupDisband)!.click());
    await pressAlert(0, t.groupDisband);
    expect(props.onDisbanded).not.toHaveBeenCalled();
    expect(view.querySelector('[role="alert"]')?.textContent).toContain(t.groupFailed);
  });

  it('opens on Members with the four group tabs and remembers its own tab', async () => {
    const memory = tabMemory();
    memory.remember('bot', 'memory');
    const props = sheet({ tabMemory: memory });
    const view = await render(<GroupProfilePage {...props} />);
    const tabs = [...view.querySelectorAll('[role="tab"]')];
    expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual([
      t.profileTabs.members,
      t.profileTabs.files,
      t.profileTabs.work,
      t.profileTabs.settings,
    ]);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
    await act(async () => (tabs[3] as HTMLElement).click());
    expect(memory.get('group')).toBe('settings');
    expect(memory.get('bot')).toBe('memory');
    expect(view.querySelector('[data-testid="profile-tab-content-settings"]')).not.toBeNull();
  });

  it('falls back to Members when the remembered tab is not a group tab', async () => {
    const view = await render(<GroupProfilePage {...sheet({}, 'routines')} />);
    expect(view.querySelector('[data-testid="profile-tab-content-members"]')).not.toBeNull();
  });

  it('keeps name, photo, background and notifications in Settings with Disband last', async () => {
    const onChatBackground = vi.fn();
    const onNotifications = vi.fn();
    const props = sheet({ onChatBackground, onNotifications }, 'settings');
    const view = await render(<GroupProfilePage {...props} />);
    const ids = [...view.querySelectorAll('[data-testid]')]
      .map((node) => node.getAttribute('data-testid'))
      .filter((id) =>
        [
          'group-rename',
          'group-avatar-settings-change',
          'group-chat-background',
          'group-notifications',
          'group-disband',
        ].includes(id ?? ''),
      );
    expect(ids).toEqual([
      'group-rename',
      'group-avatar-settings-change',
      'group-chat-background',
      'group-notifications',
      'group-disband',
    ]);
    await act(async () => button(view, t.chatBackground.title)!.click());
    expect(onChatBackground).toHaveBeenCalledOnce();
    await act(async () => button(view, t.notifications)!.click());
    expect(onNotifications).toHaveBeenCalledOnce();
    expect(button(view, t.groupInvite)).toBeNull();
  });

  it('lists the group Assignments in Work and opens the shared detail', async () => {
    const assignment: ProfileAssignment = {
      sessionId: 'assignment-7',
      botSlug: 'bo',
      title: 'Draft the launch notes',
      description: 'Collect what shipped this week.',
      activity: 'working',
      updatedAt: new Date().toISOString(),
    };
    const loadWork = vi.fn(async () => [assignment]);
    const onOpenAssignment = vi.fn();
    const props = sheet({ loadWork, onOpenAssignment }, 'work');
    const view = await render(<GroupProfilePage {...props} />);
    expect(loadWork).toHaveBeenCalledOnce();
    const row = view.querySelector<HTMLButtonElement>(
      '[data-testid="profile-assignment-assignment-7"]',
    )!;
    expect(row.textContent).toContain('Draft the launch notes');
    expect(view.textContent).toContain(t.usageToday);
    await act(async () => row.click());
    expect(onOpenAssignment).toHaveBeenCalledWith(assignment);
  });

  it('shows an empty Work tab and a retryable failure', async () => {
    const empty = await render(
      <GroupProfilePage {...sheet({ loadWork: vi.fn(async () => []) }, 'work')} />,
    );
    expect(empty.textContent).toContain(t.profileEmpty.work);
    act(() => root?.unmount());
    host?.remove();
    const loadWork = vi
      .fn<() => Promise<ProfileAssignment[]>>()
      .mockRejectedValueOnce(new Error('Group channel unavailable'))
      .mockResolvedValueOnce([]);
    const view = await render(<GroupProfilePage {...sheet({ loadWork }, 'work')} />);
    expect(view.textContent).toContain(t.profileFailed);
    await act(async () => button(view, t.tryAgain)!.click());
    expect(loadWork).toHaveBeenCalledTimes(2);
    expect(view.textContent).toContain(t.profileEmpty.work);
  });
});
