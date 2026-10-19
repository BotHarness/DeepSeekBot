// @vitest-environment jsdom
import { act, createElement, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const alert = vi.fn();
vi.mock('expo-router', () => ({ useRouter: () => ({ back() {} }) }));
vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Alert: { alert: (...args: unknown[]) => alert(...args) },
}));
vi.mock('../src/ui/bot-avatar', () => ({
  BotAvatar: ({ bot }: { bot: { slug: string } }) =>
    createElement('span', { 'data-testid': `avatar-${bot.slug}` }),
}));
vi.mock('../src/ui/shell/icons', () => ({
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
    }: {
      visible: boolean;
      label: string;
      children: ReactNode;
    }) =>
      visible ? createElement('div', { role: 'dialog', 'aria-label': label }, children) : null,
    SheetActions: pass,
    SheetNote: pass,
    SheetCallout: ({ children }: { children: ReactNode }) =>
      createElement('div', { role: 'alert' }, children),
  };
});

import type { RosterBot } from '../src/host/client';
import type { GroupActions, GroupInfo } from '../src/host/group-channel';
import { GroupInfoSheet } from '../src/ui/chat/group-info';
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
  view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

type AlertButton = { text: string; style?: string; onPress?: () => void };
const pressAlert = (call: number, text: string) =>
  act(async () =>
    (alert.mock.calls[call]![2] as AlertButton[]).find((entry) => entry.text === text)!.onPress!(),
  );

function sheet(
  overrides: Partial<Parameters<typeof GroupInfoSheet>[0]> = {},
): Parameters<typeof GroupInfoSheet>[0] {
  return {
    info,
    actions: actions(),
    pickAvatar: vi.fn(async () => undefined),
    onOpenBot: vi.fn(),
    onDisbanded: vi.fn(),
    ...overrides,
  };
}

describe('Group info', () => {
  it('lists the members, the creator, pending invitations and join requests', async () => {
    const view = await render(<GroupInfoSheet {...sheet()} />);
    const text = view.textContent ?? '';
    expect(text).toContain('Launch');
    expect(text).toContain(t.members(2));
    expect(text).toContain(t.groupOwner);
    expect(text).toContain(t.groupInvited);
    expect(text).toContain(t.groupJoinAsk);
    const headers = [...view.querySelectorAll('[role="header"]')].map((node) => node.textContent);
    expect(headers).toEqual([
      'Launch',
      t.groupSettingsSection,
      t.groupJoinsSection,
      t.groupMembersSection,
    ]);
    for (const slug of ['ada', 'bo', 'cy', 'di'])
      expect(view.querySelector(`[data-testid="avatar-${slug}"]`)).not.toBeNull();
    expect(button(view, t.groupInvite)).not.toBeNull();
  });

  it('opens a member profile, cancels an invitation and decides a join request', async () => {
    const props = sheet();
    const view = await render(<GroupInfoSheet {...props} />);
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
    const view = await render(<GroupInfoSheet {...props} />);
    await act(async () => button(view, t.groupInvite)!.click());
    const dialog = view.querySelector(`[role="dialog"][aria-label="${t.groupInvite}"]`)!;
    expect(dialog.textContent).toContain('Fay');
    await act(async () => button(dialog, 'Fay')!.click());
    expect(props.actions.invite).toHaveBeenCalledWith('fay');
  });

  it('removes a member only after the confirmation', async () => {
    const props = sheet();
    const view = await render(<GroupInfoSheet {...props} />);
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
    const props = sheet({ pickAvatar: vi.fn(async () => 'data:image/jpeg;base64,/9j/AA==') });
    const view = await render(<GroupInfoSheet {...props} />);
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

    await act(async () => button(view, t.groupAvatarChange)!.click());
    expect(props.actions.setAvatar).toHaveBeenCalledWith('data:image/jpeg;base64,/9j/AA==');
    expect(button(view, t.groupAvatarRemove)).toBeNull();
  });

  it('shows the Host refusal as a notice and keeps the page', async () => {
    const props = sheet({
      actions: actions({
        cancelInvite: vi.fn(async () => {
          throw new Error('Invitation is no longer pending');
        }),
      }),
    });
    const view = await render(<GroupInfoSheet {...props} />);
    await act(async () => button(view, t.groupInviteCancel)!.click());
    expect(view.querySelector('[role="alert"]')?.textContent).toBe(
      `${t.groupFailed} Invitation is no longer pending`,
    );
    expect(view.textContent).toContain(t.groupMembersSection);
  });

  it('disbands only after the confirmation and then leaves the page', async () => {
    const props = sheet();
    const view = await render(<GroupInfoSheet {...props} />);
    await act(async () => button(view, t.groupDisband)!.click());
    expect(alert.mock.calls[0]![0]).toBe(t.groupDisbandConfirm('Launch'));
    expect(props.actions.disband).not.toHaveBeenCalled();
    await pressAlert(0, t.groupDisband);
    expect(props.actions.disband).toHaveBeenCalled();
    expect(props.onDisbanded).toHaveBeenCalled();
  });

  it('stays on the page when disbanding fails', async () => {
    const props = sheet({
      actions: actions({
        disband: vi.fn(async () => {
          throw new Error('The group was not disbanded.');
        }),
      }),
    });
    const view = await render(<GroupInfoSheet {...props} />);
    await act(async () => button(view, t.groupDisband)!.click());
    await pressAlert(0, t.groupDisband);
    expect(props.onDisbanded).not.toHaveBeenCalled();
    expect(view.querySelector('[role="alert"]')?.textContent).toContain(t.groupFailed);
  });
});
