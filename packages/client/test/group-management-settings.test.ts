// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  return { ...(await import('./primitive-mocks.js')).shellPrimitives(), ...dialogPrimitives() };
});

vi.mock('../src/client/group-avatar-crop.js', () => ({ GroupAvatarCropModal: () => null }));

import type { WireTeamMode } from '@botharness/host-protocol/wire';
import type { BridgeActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import {
  DisbandGroupDialog,
  GroupManagementSettings,
} from '../src/client/group-management-settings.js';
import { zhTranslate as t } from '../src/client/locale.js';
import type { ChannelSummary } from '../src/client/store.js';
import { buttonNamed, dialog, typeInto } from './primitive-mocks.js';

const GROUP = { id: 'g1', name: '设计组', type: 'group', members: [] } as unknown as ChannelSummary;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function render(node: ReactElement): Promise<void> {
  await act(async () => root.render(node));
}

function nameInput(): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${t('group.name')}"]`);
  if (input === null) throw new Error('No group name input');
  return input;
}

it('shows avatar and name as settings rows and renames once on Enter then blur', async () => {
  const renameChannel = vi.fn(async () => true);
  const actions = { renameChannel, setGroupAvatar: vi.fn() } as unknown as BridgeActions;
  await render(createElement(GroupManagementSettings, { actions, t, group: GROUP }));

  const titles = [...host.querySelectorAll('[role="group"]')].map(
    (row) => document.getElementById(row.getAttribute('aria-labelledby') ?? '')?.textContent,
  );
  expect(titles).toEqual([t('group.avatar'), t('group.name')]);
  expect(host.querySelector('form')).toBeNull();
  expect(host.textContent).not.toContain(t('group.avatarRemove'));

  await typeInto(nameInput(), ' 新设计组 ');
  await act(async () => {
    nameInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    nameInput().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });

  expect(renameChannel).toHaveBeenCalledTimes(1);
  expect(renameChannel).toHaveBeenCalledWith('g1', '新设计组');
});

it('restores the current name instead of saving a blank one', async () => {
  const renameChannel = vi.fn(async () => true);
  const actions = { renameChannel, setGroupAvatar: vi.fn() } as unknown as BridgeActions;
  await render(createElement(GroupManagementSettings, { actions, t, group: GROUP }));

  await typeInto(nameInput(), '   ');
  await act(async () => {
    nameInput().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });

  expect(renameChannel).not.toHaveBeenCalled();
  expect(nameInput().value).toBe('设计组');
});

it('removes an existing avatar and reports a failed change', async () => {
  const setGroupAvatar = vi.fn(async () => false);
  const actions = { renameChannel: vi.fn(), setGroupAvatar } as unknown as BridgeActions;
  await render(
    createElement(GroupManagementSettings, {
      actions,
      t,
      group: { ...GROUP, avatar: 'data:image/png;base64,AA==' },
    }),
  );

  await act(async () => buttonNamed(t('group.avatarRemove')).click());

  expect(setGroupAvatar).toHaveBeenCalledWith('g1', null);
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(t('members.error'));
});

it('confirms disbanding with a destructive action and keeps the dialog open on failure', async () => {
  const deleteGroupChannel = vi.fn(async () => false);
  const onClose = vi.fn();
  const actions = { deleteGroupChannel } as unknown as BridgeActions;
  await render(createElement(DisbandGroupDialog, { group: GROUP, actions, t, onClose }));

  expect(dialog().getAttribute('aria-label')).toBe(t('members.delete'));
  expect(dialog().textContent).toContain('设计组');
  await act(async () => buttonNamed(t('members.delete')).click());

  expect(deleteGroupChannel).toHaveBeenCalledWith('g1');
  expect(onClose).not.toHaveBeenCalled();
  expect(dialog().querySelector('[role="alert"]')?.textContent).toBe(t('members.error'));

  deleteGroupChannel.mockResolvedValueOnce(true);
  await act(async () => buttonNamed(t('members.delete')).click());
  expect(onClose).toHaveBeenCalledTimes(1);
});

function memberTeamMode(): WireTeamMode {
  return {
    enabled: true,
    activeMembers: 2,
    ownerPasswordSet: true,
    insecureHttpAllowed: false,
    memberUrls: [],
    isolation: 'trial',
    viewer: {
      kind: 'member',
      humanId: 'alice',
      displayName: 'Alice',
      owner: false,
      mustChangePassword: false,
      roleIds: [],
      permissions: [],
      models: { all: true },
    },
  };
}

function teamCall(access: { role: string; editDetails: string }): BridgeCall {
  return vi.fn<BridgeCall>(async (method) => {
    if (method === 'teamMode') return { ok: true, value: memberTeamMode() };
    if (method === 'channelGet')
      return {
        ok: true,
        value: {
          channel: { id: 'g1', type: 'group', name: '设计组', members: [] },
          role: access.role,
          policy: { editDetails: access.editDetails },
          visibility: { kind: 'public' },
          admins: [],
        },
      };
    return { ok: true, value: [] };
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

it('shows the name and avatar read-only to a member without editDetails', async () => {
  const actions = {
    renameChannel: vi.fn(),
    setGroupAvatar: vi.fn(),
    teamCall: teamCall({ role: 'member', editDetails: 'admins' }),
  } as unknown as BridgeActions;
  await render(
    createElement(GroupManagementSettings, {
      actions,
      t,
      group: { ...GROUP, avatar: 'data:image/png;base64,AA==' },
    }),
  );
  await settle();

  expect(host.querySelector(`input[aria-label="${t('group.name')}"]`)).toBeNull();
  expect(host.querySelector('[data-group-name="read-only"]')?.textContent).toBe('设计组');
  expect(host.textContent).not.toContain(t('group.avatarChoose'));
  expect(host.textContent).not.toContain(t('group.avatarRemove'));
  expect(host.textContent).toContain(t('group.detailsAdminsOnly'));
});

it('keeps the name and avatar editable for a Channel admin', async () => {
  const actions = {
    renameChannel: vi.fn(),
    setGroupAvatar: vi.fn(),
    teamCall: teamCall({ role: 'admin', editDetails: 'admins' }),
  } as unknown as BridgeActions;
  await render(createElement(GroupManagementSettings, { actions, t, group: GROUP }));
  await settle();

  expect(nameInput().disabled).toBe(false);
  expect(buttonNamed(t('group.avatarChoose'))).not.toBeNull();
  expect(host.textContent).not.toContain(t('group.detailsAdminsOnly'));
});

it('explains a refused rename, restores the name and turns read-only', async () => {
  const access = { role: 'member', editDetails: 'everyone' };
  const renameChannel = vi.fn(async () => {
    access.editDetails = 'admins';
    return false;
  });
  const actions = {
    renameChannel,
    setGroupAvatar: vi.fn(),
    teamCall: teamCall(access),
  } as unknown as BridgeActions;
  await render(createElement(GroupManagementSettings, { actions, t, group: GROUP }));
  await settle();

  await typeInto(nameInput(), 'Alice Lobby');
  await act(async () => {
    nameInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await settle();

  expect(renameChannel).toHaveBeenCalledWith('g1', 'Alice Lobby');
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(t('group.detailsRefused'));
  expect(host.querySelector('[data-group-name="read-only"]')?.textContent).toBe('设计组');
});

it('keeps the typed name after a save that fails for another reason', async () => {
  const actions = {
    renameChannel: vi.fn(async () => false),
    setGroupAvatar: vi.fn(),
    teamCall: teamCall({ role: 'member', editDetails: 'everyone' }),
  } as unknown as BridgeActions;
  await render(createElement(GroupManagementSettings, { actions, t, group: GROUP }));
  await settle();

  await typeInto(nameInput(), 'Alice Lobby');
  await act(async () => {
    nameInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await settle();

  expect(host.querySelector('[role="alert"]')?.textContent).toBe(t('members.error'));
  expect(nameInput().value).toBe('Alice Lobby');
});

it('reads access again when the settings reopen after an admin allows everyone', async () => {
  const access = { role: 'member', editDetails: 'admins' };
  const actions = {
    renameChannel: vi.fn(),
    setGroupAvatar: vi.fn(),
    teamCall: teamCall(access),
  } as unknown as BridgeActions;
  await render(createElement(GroupManagementSettings, { actions, t, group: GROUP }));
  await settle();
  expect(host.querySelector('[data-group-name="read-only"]')).not.toBeNull();

  await act(async () => root.render(createElement('div')));
  access.editDetails = 'everyone';
  await render(createElement(GroupManagementSettings, { actions, t, group: GROUP }));
  await settle();

  expect(nameInput().disabled).toBe(false);
});

it('keeps a cached denial when the access read fails on reopen', async () => {
  const access = { role: 'member', editDetails: 'admins' };
  let fail = false;
  const base = teamCall(access);
  const call = vi.fn<BridgeCall>(async (method, payload, signal) => {
    if (fail && method === 'channelGet')
      return { ok: false, error: { code: 'unavailable', message: 'offline', details: {} } };
    return base(method, payload, signal);
  });
  const actions = {
    renameChannel: vi.fn(),
    setGroupAvatar: vi.fn(),
    teamCall: call,
  } as unknown as BridgeActions;
  await render(createElement(GroupManagementSettings, { actions, t, group: GROUP }));
  await settle();
  expect(host.querySelector('[data-group-name="read-only"]')).not.toBeNull();

  await act(async () => root.render(createElement('div')));
  fail = true;
  await render(createElement(GroupManagementSettings, { actions, t, group: GROUP }));
  await settle();

  expect(host.querySelector('[data-group-name="read-only"]')).not.toBeNull();
});
