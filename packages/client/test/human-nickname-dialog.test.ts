// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

type Item = { id: string; type?: string; label?: ReactNode };

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  const { createElement: element } = await import('react');
  return {
    ...dialogPrimitives(),
    IconCheckOutlineRegular: () => null,
    IconSettingsOutlineRegular: () => null,
    IconTrashOutlineRegular: () => null,
    IconUserOutlineRegular: () => null,
    Menu: ({
      open,
      anchor,
      items,
      onSelect,
    }: {
      open: boolean;
      anchor: ReactNode;
      items: readonly Item[];
      onSelect(id: string): void;
    }) =>
      element(
        'div',
        null,
        anchor,
        open
          ? items
              .filter((item) => item.type === undefined)
              .map((item) =>
                element(
                  'button',
                  { key: item.id, role: 'menuitem', onClick: () => onSelect(item.id) },
                  item.label,
                ),
              )
          : null,
      ),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { ChannelHeaderMenu } from '../src/client/human-channel-name.js';
import { zhTranslate as t } from '../src/client/locale.js';
import type { ChannelSummary } from '../src/client/store.js';
import { buttonNamed, dialog, fieldNamed, typeInto } from './primitive-mocks.js';

const GROUP = {
  id: 'g-qa',
  type: 'group',
  name: 'QA 群',
  members: [],
  createdAt: '',
  updatedAt: '',
  humanNickname: '船长',
} as unknown as ChannelSummary;

let root: Root;
let host: HTMLDivElement;

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

async function openNickname(
  channel: ChannelSummary,
  setHumanNickname: (id: string, nickname: string | null) => Promise<boolean>,
): Promise<void> {
  await act(async () =>
    root.render(
      createElement(ChannelHeaderMenu, {
        channel,
        actions: { setHumanNickname } as unknown as BridgeActions,
        t,
        anchor: ({ toggle }) =>
          createElement('button', { 'aria-label': t('humanNickname.menu'), onClick: toggle }),
      }),
    ),
  );
  await act(async () => buttonNamed(t('humanNickname.menu')).click());
  await act(async () => buttonNamed(t('humanNickname.title')).click());
}

const nickname = () => fieldNamed(t('humanNickname.title'));
const submit = () => dialog().querySelector('form')!;

it('edits the Channel nickname and saves the trimmed draft on Enter', async () => {
  const setHumanNickname = vi.fn(async () => true);
  await openNickname(GROUP, setHumanNickname);
  expect(dialog().getAttribute('aria-label')).toBe(t('humanNickname.title'));
  expect(dialog().textContent).toContain(t('humanNickname.description', { channel: 'QA 群' }));
  expect(nickname().value).toBe('船长');
  expect(nickname().hasAttribute('data-human-nickname')).toBe(true);
  await typeInto(nickname(), '  教授  ');
  await act(async () => submit().requestSubmit());
  expect(setHumanNickname).toHaveBeenCalledWith('g-qa', '教授');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('saves an empty draft as inheriting the default name', async () => {
  const setHumanNickname = vi.fn(async () => true);
  await openNickname(GROUP, setHumanNickname);
  await typeInto(nickname(), '   ');
  await act(async () => buttonNamed(t('humanName.save')).click());
  expect(setHumanNickname).toHaveBeenCalledWith('g-qa', null);
});

it('restores the default name and only offers it when a nickname is set', async () => {
  const setHumanNickname = vi.fn(async () => true);
  await openNickname(GROUP, setHumanNickname);
  await act(async () => buttonNamed(t('humanNickname.clear')).click());
  expect(setHumanNickname).toHaveBeenCalledWith('g-qa', null);
  expect(document.querySelector('[role="dialog"]')).toBeNull();

  await openNickname({ ...GROUP, humanNickname: null } as ChannelSummary, setHumanNickname);
  expect(buttonNamed(t('humanNickname.clear')).disabled).toBe(true);
});

it('blocks control characters and keeps the dialog open on a failed save', async () => {
  const setHumanNickname = vi.fn(async () => false);
  await openNickname(GROUP, setHumanNickname);
  await typeInto(nickname(), 'a\u0007b');
  expect(buttonNamed(t('humanName.save')).disabled).toBe(true);
  await act(async () => submit().requestSubmit());
  expect(setHumanNickname).not.toHaveBeenCalled();
  await typeInto(nickname(), 'ab');
  await act(async () => submit().requestSubmit());
  expect(setHumanNickname).toHaveBeenCalledWith('g-qa', 'ab');
  expect(dialog().querySelector('[role="alert"]')?.textContent).toBe(t('humanName.error'));
  await act(async () => buttonNamed(t('common.cancel')).click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
