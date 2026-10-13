// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  return dialogPrimitives();
});

vi.mock('../src/client/group-avatar-crop.js', () => ({ GroupAvatarCropModal: () => null }));

import type { BridgeActions } from '../src/client/actions.js';
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

  const titles = [...host.querySelectorAll('[role="group"]')].map((row) =>
    document.getElementById(row.getAttribute('aria-labelledby') ?? '')?.textContent,
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
