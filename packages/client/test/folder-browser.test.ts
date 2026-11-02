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
import { createActions } from '../src/client/actions.js';
import { createStore } from '../src/client/store.js';
import { BridgeCallError } from '../src/client/bridge.js';
import { buttonNamed, dialog, typeInto } from './primitive-mocks.js';

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
  it('offers Host drives and switches from C to D by clicking, without typing a path', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const roots = [
      { name: 'C:\\', path: 'C:\\', hidden: false },
      { name: 'D:\\', path: 'D:\\', hidden: false },
    ];
    const c = {
      ...home,
      path: 'C:\\Users\\ada',
      home: 'C:\\Users\\ada',
      roots,
      crumbs: [roots[0]!],
      entries: [],
    };
    const d = { ...c, path: 'D:\\', crumbs: [roots[1]!] };
    const call = vi.fn(async (_method: string, input: Record<string, unknown>) => ({
      ok: true as const,
      value: input.path === 'D:\\' ? d : c,
    }));
    const actions = createActions(call, createStore());
    const initial = await actions.listHostFolders();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onChoose = vi.fn();
    try {
      await act(async () =>
        root.render(
          createElement(FolderBrowser, {
            initial,
            actions,
            onChoose,
            onCancel: vi.fn(),
            busy: false,
            t: zhTranslate,
          }),
        ),
      );
      const drive = [
        ...dialog().querySelectorAll<HTMLButtonElement>('[data-folder-browser-root]'),
      ].find((button) => button.dataset.folderBrowserRoot === 'D:\\');
      expect(drive).toBeDefined();
      await act(async () => drive!.click());
      expect(call).toHaveBeenLastCalledWith(
        'folderBrowse',
        { path: 'D:\\' },
        expect.any(AbortSignal),
      );
      await act(async () => buttonNamed(zhTranslate('grant.authorize')).click());
      expect(onChoose).toHaveBeenCalledWith('D:\\');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
  it.each(['D:\\projects', 'E:/项目'])(
    'navigates from the Windows home drive to %s before authorizing',
    async (path) => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      const onChoose = vi.fn();
      const destination = { ...project, path, crumbs: [{ name: path, path, hidden: false }] };
      const actions = {
        listHostFolders: vi.fn(async () => destination),
      } as unknown as BridgeActions;
      try {
        await act(async () =>
          root.render(
            createElement(FolderBrowser, {
              initial: {
                ...home,
                path: 'C:\\Users\\ada',
                home: 'C:\\Users\\ada',
                crumbs: [{ name: 'C:\\', path: 'C:\\', hidden: false }],
                entries: [],
              },
              actions,
              onChoose,
              onCancel: vi.fn(),
              busy: false,
              t: zhTranslate,
            }),
          ),
        );
        const input = dialog().querySelector<HTMLInputElement>('input[type="text"]');
        expect(
          dialog().querySelectorAll(`[aria-label="${zhTranslate('grant.pathLabel')}"]`),
        ).toHaveLength(1);
        expect(
          input,
          'The folder browser must let the user enter a path on another drive',
        ).not.toBeNull();
        await typeInto(input!, path);
        expect(buttonNamed(zhTranslate('grant.authorize')).disabled).toBe(true);
        await act(async () =>
          input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
        );
        expect(actions.listHostFolders).toHaveBeenCalledWith(path, expect.any(AbortSignal));
        expect(input!.value).toBe(path);
        await act(async () => buttonNamed(zhTranslate('grant.authorize')).click());
        expect(onChoose).toHaveBeenCalledWith(path);
      } finally {
        await act(async () => root.unmount());
        container.remove();
      }
    },
  );
  it('keeps authorization disabled after a failed location change and allows recovery', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onChoose = vi.fn();
    const listHostFolders = vi
      .fn()
      .mockRejectedValueOnce(new Error('Directory unavailable'))
      .mockResolvedValueOnce(project);
    try {
      await act(async () =>
        root.render(
          createElement(FolderBrowser, {
            initial: home,
            actions: { listHostFolders } as unknown as BridgeActions,
            onChoose,
            onCancel: vi.fn(),
            busy: false,
            t: zhTranslate,
          }),
        ),
      );
      const input = dialog().querySelector<HTMLInputElement>('input[type="text"]')!;
      await typeInto(input, 'relative');
      expect(buttonNamed(zhTranslate('grant.browseGo')).disabled).toBe(true);
      await typeInto(input, 'D:\\missing');
      await act(async () => buttonNamed(zhTranslate('grant.browseGo')).click());
      expect(dialog().textContent).toContain('Directory unavailable');
      expect(buttonNamed(zhTranslate('grant.authorize')).disabled).toBe(true);
      expect(onChoose).not.toHaveBeenCalled();
      await act(async () =>
        dialog().querySelector<HTMLButtonElement>('[data-folder-browser-item]')!.click(),
      );
      expect(input.value).toBe(project.path);
      expect(buttonNamed(zhTranslate('grant.authorize')).disabled).toBe(false);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
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

  it('keeps every place clickable while a folder is slow and says so', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const listHostFolders = vi.fn((path: string) =>
      path === '/home/ada/project' ? new Promise<never>(() => undefined) : Promise.resolve(home),
    );
    try {
      await act(async () =>
        root.render(
          createElement(FolderBrowser, {
            initial: home,
            actions: { listHostFolders } as unknown as BridgeActions,
            onChoose: vi.fn(),
            onCancel: vi.fn(),
            busy: false,
            t: zhTranslate,
          }),
        ),
      );
      await act(async () =>
        dialog().querySelector<HTMLButtonElement>('[data-folder-browser-item]')!.click(),
      );
      expect(dialog().textContent).not.toContain(zhTranslate('grant.browseSlow'));
      await act(async () => vi.advanceTimersByTime(1_000));
      expect(dialog().textContent).toContain(zhTranslate('grant.browseSlow'));
      const crumb = dialog().querySelector<HTMLButtonElement>('[data-folder-browser-crumb]')!;
      expect(crumb.disabled).toBe(false);
      await act(async () => crumb.click());
      expect(listHostFolders).toHaveBeenLastCalledWith('/', expect.any(AbortSignal));
      expect(dialog().textContent).not.toContain(zhTranslate('grant.browseSlow'));
      expect(buttonNamed(zhTranslate('grant.authorize')).disabled).toBe(false);
    } finally {
      vi.useRealTimers();
      await act(async () => root.unmount());
      container.remove();
    }
  });
  it('reopens a folder it just listed without asking the Host again', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const listHostFolders = vi.fn(async (path: string) =>
      path === '/home/ada/project' ? project : home,
    );
    try {
      await act(async () =>
        root.render(
          createElement(FolderBrowser, {
            initial: home,
            actions: { listHostFolders } as unknown as BridgeActions,
            onChoose: vi.fn(),
            onCancel: vi.fn(),
            busy: false,
            t: zhTranslate,
          }),
        ),
      );
      const crumbNamed = (name: string) =>
        [...dialog().querySelectorAll<HTMLButtonElement>('[data-folder-browser-crumb]')].find(
          (button) => button.textContent === name,
        )!;
      await act(async () =>
        dialog().querySelector<HTMLButtonElement>('[data-folder-browser-item]')!.click(),
      );
      await act(async () => crumbNamed('ada').click());
      await act(async () =>
        dialog().querySelector<HTMLButtonElement>('[data-folder-browser-item]')!.click(),
      );
      expect(listHostFolders.mock.calls.map(([path]) => path)).toEqual([
        '/home/ada/project',
        '/home/ada',
      ]);
      expect(
        dialog().querySelector('[data-folder-browser-crumb][aria-current="location"]')?.textContent,
      ).toBe('project');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
  it('loads the next page of a very large folder on request', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const first = { ...home, truncated: true, nextOffset: 2 };
    const rest = {
      ...home,
      entries: [{ name: 'zeta', path: '/home/ada/zeta', hidden: false }],
      truncated: false,
    };
    const listHostFolders = vi.fn(async () => rest);
    try {
      await act(async () =>
        root.render(
          createElement(FolderBrowser, {
            initial: first,
            actions: { listHostFolders } as unknown as BridgeActions,
            onChoose: vi.fn(),
            onCancel: vi.fn(),
            busy: false,
            t: zhTranslate,
          }),
        ),
      );
      expect(dialog().textContent).not.toContain(zhTranslate('grant.browseTruncated'));
      await act(async () => buttonNamed(zhTranslate('grant.browseMore')).click());
      expect(listHostFolders).toHaveBeenCalledWith('/home/ada', expect.any(AbortSignal), 2);
      expect(
        [...dialog().querySelectorAll('[data-folder-browser-item]')].map((n) => n.textContent),
      ).toEqual(['project', 'zeta']);
      expect(dialog().querySelector('[data-folder-browser-more]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
  it('explains a folder that does not answer', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const listHostFolders = vi.fn(async () => {
      throw new BridgeCallError('folder-browse/timeout', 'That folder did not answer in time.');
    });
    try {
      await act(async () =>
        root.render(
          createElement(FolderBrowser, {
            initial: home,
            actions: { listHostFolders } as unknown as BridgeActions,
            onChoose: vi.fn(),
            onCancel: vi.fn(),
            busy: false,
            t: zhTranslate,
          }),
        ),
      );
      await act(async () =>
        dialog().querySelector<HTMLButtonElement>('[data-folder-browser-item]')!.click(),
      );
      expect(dialog().textContent).toContain(zhTranslate('grant.browseTimeout'));
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
