// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  const { createElement: element } = await import('react');
  return {
    ...dialogPrimitives(),
    IconCheckOutlineRegular: () => element('span', { 'data-icon': 'IconCheckOutlineRegular' }),
    IconEditOutlineRegular: () => null,
    IconTrashOutlineRegular: () => null,
  };
});

import type { MenuItem } from '@deepseek-ai/dsh-client-ui-primitives';

import { zh, zhTranslate, type BotHarnessKey } from '../src/client/locale.js';
import {
  channelMoveMenuItems,
  CreateChannelModal,
  CreateSectionModal,
  globalSortMenuItems,
  SectionDeleteModal,
  NEW_SECTION_MOVE_TARGET,
  SectionRenameModal,
  sectionMenuItems,
  UNGROUPED_MOVE_TARGET,
} from '../src/client/section-management.js';
import { buttonNamed, dialog, fieldNamed, typeInto } from './primitive-mocks.js';

const SECTION = { id: 's1', name: '工作流', channelIds: [] };

const t = zhTranslate;

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

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => button.click());
}

async function pressEnter(): Promise<void> {
  const form = dialog().querySelector('form');
  if (form === null) throw new Error('No form');
  await act(async () => form.requestSubmit());
}

describe('section menus', () => {
  it('orders the global menu as sort modes followed by hidden Channel management', () => {
    expect(globalSortMenuItems(t).map((item) => ('id' in item ? item.id : undefined))).toEqual([
      'sort-label',
      'updated',
      'manual',
      'roster-separator',
      'mark-all-read',
      'hidden',
      'channel-history',
    ]);
    expect(globalSortMenuItems(t)).toContainEqual(
      expect.objectContaining({ id: 'mark-all-read', disabled: true }),
    );
    expect(globalSortMenuItems(t, { hasUnread: true })).toContainEqual(
      expect.objectContaining({ id: 'mark-all-read', disabled: false }),
    );
  });

  it('orders the section menu: sort modes, rename, danger delete last', () => {
    const items = sectionMenuItems(t);
    expect(items.map((item) => ('id' in item ? item.id : undefined))).toEqual([
      'sort-label',
      'updated',
      'manual',
      'inherit',
      'section-separator',
      'move-up',
      'move-down',
      'section-action-separator',
      'rename',
      'delete',
    ]);
    const last = items.at(-1);
    expect(last !== undefined && 'danger' in last && last.danger === true).toBe(true);
    const bounded = sectionMenuItems(t, { canMoveUp: false, canMoveDown: true });
    const moveUp = bounded.find((item) => 'id' in item && item.id === 'move-up');
    const moveDown = bounded.find((item) => 'id' in item && item.id === 'move-down');
    expect(moveUp !== undefined && 'disabled' in moveUp && moveUp.disabled).toBe(true);
    expect(moveDown !== undefined && 'disabled' in moveDown && moveDown.disabled).toBe(false);
  });
});

describe('channel move menu', () => {
  const sections = [
    { id: 's1', name: '工作流', channelIds: [] },
    { id: 's2', name: '研究', channelIds: [] },
  ];

  function moveItem(currentSectionId: string | undefined): MenuItem {
    const [move] = channelMoveMenuItems(t, sections, currentSectionId);
    if (move === undefined || !('id' in move) || move.id !== 'move' || !('label' in move)) {
      throw new Error('move menu not built');
    }
    return move;
  }

  it('lists every section plus 未分组 under one 移动到 submenu', () => {
    const move = moveItem('s2');

    expect(move.label).toBe('移动到');
    expect(move.submenu?.map((item) => item.id)).toEqual([
      NEW_SECTION_MOVE_TARGET,
      's1',
      's2',
      UNGROUPED_MOVE_TARGET,
    ]);
  });

  it('marks the current scope with the trailing check and only that row', () => {
    const label = (item: MenuItem): string => renderToStaticMarkup(item.label as never);
    const inSection = (moveItem('s2').submenu ?? []).map(label);
    expect(inSection[2]).toContain('data-icon="IconCheckOutlineRegular"');
    expect(inSection[1]).not.toContain('data-icon="IconCheckOutlineRegular"');
    expect(inSection[3]).not.toContain('data-icon="IconCheckOutlineRegular"');

    const ungrouped = (moveItem(undefined).submenu ?? []).map(label);
    expect(ungrouped[3]).toContain('data-icon="IconCheckOutlineRegular"');
    expect(ungrouped[0]).not.toContain('data-icon="IconCheckOutlineRegular"');
  });
});

describe('section rename modal', () => {
  it('labels the name field and submits the trimmed draft on Enter', async () => {
    const onRename = vi.fn();
    await render(
      createElement(SectionRenameModal, {
        t,
        section: { ...SECTION, name: '  旧名  ' },
        onCancel: () => undefined,
        onRename,
      }),
    );

    expect(dialog().getAttribute('aria-label')).toBe('重命名频道分组');
    expect(fieldNamed('分组名称').value).toBe('  旧名  ');
    await pressEnter();

    expect(onRename).toHaveBeenCalledWith('旧名');
  });

  it('submits an edited name through the primary button', async () => {
    const onRename = vi.fn();
    await render(
      createElement(SectionRenameModal, {
        t,
        section: SECTION,
        onCancel: () => undefined,
        onRename,
      }),
    );

    await typeInto(fieldNamed('分组名称'), '新名');
    await click(buttonNamed('重命名'));

    expect(onRename).toHaveBeenCalledWith('新名');
  });

  it('keeps a blank draft from submitting by button or Enter', async () => {
    const onRename = vi.fn();
    await render(
      createElement(SectionRenameModal, {
        t,
        section: { ...SECTION, name: '   ' },
        onCancel: () => undefined,
        onRename,
      }),
    );

    expect(buttonNamed('重命名').disabled).toBe(true);
    await pressEnter();
    expect(onRename).not.toHaveBeenCalled();
  });

  it('cancels through the footer and the close button', async () => {
    const onCancel = vi.fn();
    await render(
      createElement(SectionRenameModal, {
        t,
        section: SECTION,
        onCancel,
        onRename: () => undefined,
      }),
    );

    await click(buttonNamed('取消'));
    await click(buttonNamed('关闭'));

    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

describe('section delete modal', () => {
  it('explains the consequence and confirms with a destructive action', async () => {
    const onDelete = vi.fn();
    const onCancel = vi.fn();
    await render(
      createElement(SectionDeleteModal, {
        t,
        section: { ...SECTION, name: '工作流', channelIds: ['c1'] },
        onCancel,
        onDelete,
      }),
    );

    expect(dialog().getAttribute('aria-label')).toBe('删除频道分组');
    expect(dialog().textContent).toContain('工作流');
    expect(dialog().textContent).toContain('其中的频道会移出分组、变为未分组频道');

    await click(buttonNamed('删除'));
    await click(buttonNamed('取消'));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('section create modal', () => {
  it('asks for a section name and stays inert while it is blank', async () => {
    const onCreate = vi.fn();
    const onCancel = vi.fn();
    await render(createElement(CreateSectionModal, { t, onCancel, onCreate }));

    expect(dialog().getAttribute('aria-label')).toBe('创建频道分组');
    expect(fieldNamed('分组名称').placeholder).toBe('分组名称');
    expect(buttonNamed('创建').disabled).toBe(true);
    await pressEnter();
    expect(onCreate).not.toHaveBeenCalled();

    await typeInto(fieldNamed('分组名称'), ' 设计 ');
    await pressEnter();
    expect(onCreate).toHaveBeenCalledWith('设计');

    await click(buttonNamed('取消'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('channel create modal', () => {
  it('titles an ungrouped channel and a section-scoped channel', async () => {
    await render(
      createElement(CreateChannelModal, {
        t,
        onCancel: () => undefined,
        onCreate: async () => undefined,
      }),
    );
    expect(dialog().getAttribute('aria-label')).toBe('创建频道');

    await render(
      createElement(CreateChannelModal, {
        t,
        sectionName: '工作流',
        onCancel: () => undefined,
        onCreate: async () => undefined,
      }),
    );
    expect(dialog().getAttribute('aria-label')).toBe('在「工作流」中创建频道');
  });

  it('shows a failed create inline and lets the Human retry', async () => {
    const onCreate = vi
      .fn<(name: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('磁盘已满'))
      .mockResolvedValueOnce(undefined);
    await render(createElement(CreateChannelModal, { t, onCancel: () => undefined, onCreate }));

    expect(buttonNamed('创建').disabled).toBe(true);
    await typeInto(fieldNamed('频道名称'), '\u200b\u200d');
    expect(buttonNamed('创建').disabled).toBe(true);
    await typeInto(fieldNamed('频道名称'), '周报');
    await click(buttonNamed('创建'));

    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('磁盘已满');
    await click(buttonNamed('创建'));
    expect(onCreate).toHaveBeenLastCalledWith('周报');
    expect(dialog().querySelector('[role="alert"]')).toBeNull();
  });
});
