// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  return {
    ...dialogPrimitives(),
    Switch: () => null,
    Tag: ({ children }: { children: ReactNode }) => createElement('span', null, children),
    Tooltip: ({ children }: { children: ReactNode }) => children,
    IconChevronDownOutlineRegular: () => null,
    IconCloseOutlineRegular: () => null,
    IconFolderOpenOutlineRegular: () => null,
  };
});

import type { BridgeActions, HostDirectoryListing } from '../src/client/actions.js';
import { zhTranslate } from '../src/client/locale.js';
import { FolderBrowser } from '../src/client/workspace-grants-entry.js';
import { buttonNamed, dialog } from './primitive-mocks.js';

const home: HostDirectoryListing = {
  path: '/home/ada',
  home: '/home/ada',
  crumbs: [
    { name: '/', path: '/', hidden: false },
    { name: 'ada', path: '/home/ada', hidden: false },
  ],
  entries: [
    { name: 'project', path: '/home/ada/project', hidden: false },
    { name: '.cache', path: '/home/ada/.cache', hidden: true },
  ],
  truncated: false,
};

const project: HostDirectoryListing = {
  ...home,
  path: '/home/ada/project',
  crumbs: [...home.crumbs, { name: 'project', path: '/home/ada/project', hidden: false }],
  entries: [],
};

describe('FolderBrowser', () => {
  it('navigates through the tagged folder list and authorizes the current folder', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onChoose = vi.fn();
    const onCancel = vi.fn();
    const actions = {
      listHostFolders: vi.fn(async () => project),
    } as unknown as BridgeActions;
    try {
      await act(async () =>
        root.render(
          createElement(FolderBrowser, {
            initial: home,
            actions,
            onCancel,
            onChoose,
            busy: false,
            t: zhTranslate,
          }),
        ),
      );
      expect(dialog().querySelector('[data-folder-browser]')).not.toBeNull();
      const items = () =>
        [...dialog().querySelectorAll('[data-folder-browser-item]')].map((n) => n.textContent);
      expect(items()).toEqual(['project']);
      expect(
        dialog().querySelector('[data-folder-browser-crumb][aria-current="location"]')?.textContent,
      ).toBe('ada');
      await act(async () =>
        dialog().querySelector<HTMLButtonElement>('[data-folder-browser-item]')!.click(),
      );
      expect(actions.listHostFolders).toHaveBeenCalledWith(
        '/home/ada/project',
        expect.any(AbortSignal),
      );
      expect(
        dialog().querySelector('[data-folder-browser-crumb][aria-current="location"]')?.textContent,
      ).toBe('project');
      expect(dialog().textContent).toContain(zhTranslate('grant.browseEmpty'));
      await act(async () => buttonNamed(zhTranslate('grant.authorize')).click());
      expect(onChoose).toHaveBeenCalledWith('/home/ada/project');
      await act(async () => buttonNamed(zhTranslate('common.cancel')).click());
      expect(onCancel).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
