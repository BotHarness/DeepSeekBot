// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  type Item = {
    type?: string;
    id: string;
    label?: ReactNode;
    text?: ReactNode;
    disabled?: boolean;
    submenu?: Item[];
  };
  return {
    writeClipboard: vi.fn(async () => true),
    IconEllipsisOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconChevronLeftOutlineRegular: stub,
    IconCopyOutlineRegular: stub,
    IconRefreshOutlineRegular: stub,
    IconSettingsOutlineRegular: stub,
    IconDownloadOutlineRegular: stub,
    Tooltip: ({ children }: { children: ReactNode }) => children,
    Menu: ({
      anchor,
      items,
      onSelect,
    }: {
      anchor: ReactNode;
      items: Item[];
      onSelect: (id: string) => void;
    }) =>
      createElement(
        'div',
        { role: 'menu' },
        anchor,
        items
          .flatMap((item) => [item, ...(item.submenu ?? [])])
          .map((item) =>
            item.type
              ? createElement('span', { key: item.id }, item.text)
              : createElement(
                  'button',
                  {
                    key: item.id,
                    role: 'menuitem',
                    'data-id': item.id,
                    disabled: item.disabled,
                    onClick: () => onSelect(item.id),
                  },
                  item.label,
                ),
          ),
      ),
  };
});
import {
  createFileOpenPreferences,
  fileOpenScope,
  resolveFileOpenDefault,
} from '../src/client/file-open-preferences.js';
import type { HostFileApplication, HostFileTarget } from '../src/client/host-file-actions.js';
import { HostFileOpenButton, type HostFileCommands } from '../src/client/host-file-menu.js';
import { zhTranslate } from '../src/client/locale.js';

function memoryStorage(failWrites = false) {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failWrites) throw new Error('quota exceeded');
      values.set(key, value);
    },
  };
}
const app = (id: string, system = false): HostFileApplication => ({
  id,
  name: id.toUpperCase(),
  default: system,
  icon: null,
});
const md = { kind: 'file', type: 'md' } as const;

describe('file-open default preference owner', () => {
  it('prefers the explicit choice, then the Host system default, and never the first listed application', () => {
    const options = { applications: [app('first'), app('system', true), app('mine')] };
    expect(resolveFileOpenDefault(options, undefined)).toMatchObject({
      source: 'system',
      application: { id: 'system' },
    });
    expect(resolveFileOpenDefault(options, { application: 'mine', name: 'MINE' })).toMatchObject({
      source: 'preference',
      application: { id: 'mine' },
    });
    expect(resolveFileOpenDefault({ applications: [app('first')] }, undefined)).toEqual({
      source: 'none',
    });
    expect(resolveFileOpenDefault(options, { application: 'removed', name: 'Removed' })).toEqual({
      source: 'invalid',
      preference: { application: 'removed', name: 'Removed' },
    });
  });
  it('scopes files by type and directories separately', () => {
    expect(fileOpenScope({ kind: 'file', path: '/host/a/Notes.MD' })).toEqual(md);
    expect(fileOpenScope({ kind: 'file', path: 'C:\\host\\.gitignore' })).toEqual({
      kind: 'file',
      type: '',
    });
    expect(fileOpenScope({ kind: 'directory', path: '/host/a.md' })).toEqual({
      kind: 'directory',
    });
  });
  it('isolates stored defaults by Host profile and reveals nothing before identity resolves', async () => {
    const storage = memoryStorage();
    const first = createFileOpenPreferences({
      storage,
      context: async () => ({ profileId: 'p1' }),
    });
    expect(first.get(md)).toBeUndefined();
    expect(() => first.set(md, { application: 'mine', name: 'MINE' })).toThrow(/identified/);
    await first.ready();
    first.set(md, { application: 'mine', name: 'MINE' });
    first.set({ kind: 'directory' }, { application: 'finder', name: 'Finder' });
    expect(first.get(md)).toEqual({ application: 'mine', name: 'MINE' });
    expect(first.get({ kind: 'file', type: 'txt' })).toBeUndefined();
    const other = createFileOpenPreferences({
      storage,
      context: async () => ({ profileId: 'p2' }),
    });
    await other.ready();
    expect(other.get(md)).toBeUndefined();
    const reopened = createFileOpenPreferences({
      storage,
      context: async () => ({ profileId: 'p1' }),
    });
    await reopened.ready();
    expect(reopened.get({ kind: 'directory' })).toEqual({ application: 'finder', name: 'Finder' });
    reopened.clear(md);
    expect(reopened.get(md)).toBeUndefined();
    expect(reopened.get({ kind: 'directory' })).toBeDefined();
  });
  it('reports identity and storage failures instead of pretending a default was saved', async () => {
    const missing = createFileOpenPreferences({
      storage: memoryStorage(),
      context: async () => {
        throw new Error('offline');
      },
    });
    await expect(missing.ready()).rejects.toThrow('offline');
    const failing = createFileOpenPreferences({
      storage: memoryStorage(true),
      context: async () => ({ profileId: 'p1' }),
    });
    await failing.ready();
    expect(() => failing.set(md, { application: 'mine', name: 'MINE' })).toThrow('quota exceeded');
    expect(failing.get(md)).toBeUndefined();
  });
  it('notifies subscribers for local and cross-tab changes of the same profile only', async () => {
    let external: ((key: string | null) => void) | undefined;
    const preferences = createFileOpenPreferences({
      storage: memoryStorage(),
      context: async () => ({ profileId: 'p1' }),
      onExternalChange: (listener) => {
        external = listener;
        return () => {};
      },
    });
    await preferences.ready();
    const listener = vi.fn();
    preferences.subscribe(listener);
    preferences.set(md, { application: 'mine', name: 'MINE' });
    expect(listener).toHaveBeenCalledTimes(1);
    external?.('botharness/file-open-defaults/v1/p2');
    expect(listener).toHaveBeenCalledTimes(1);
    external?.('botharness/file-open-defaults/v1/p1');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const click = async (element: Element | null | undefined) => {
  await act(async () => element!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
};
const main = () => container.querySelector<HTMLButtonElement>('.bh-file-open-main')!;
const more = () => container.querySelector<HTMLButtonElement>('.bh-file-open-more')!;
const item = (id: string) => document.querySelector<HTMLButtonElement>(`[data-id="${id}"]`);

async function mount(
  applications: HostFileApplication[],
  target: HostFileTarget = { path: '/host/memory/note.md', relativePath: 'note.md', kind: 'file' },
  storage = memoryStorage(),
) {
  const preferences = createFileOpenPreferences({
    storage,
    context: async () => ({ profileId: 'p1' }),
  });
  const commands = {
    target: vi.fn(async () => target),
    applications: vi.fn(async () => ({ available: applications.length > 0, applications })),
    open: vi.fn(async () => {}),
    download: vi.fn(async () => {}),
    preferences,
  } satisfies HostFileCommands;
  await act(async () =>
    root.render(
      createElement(HostFileOpenButton, {
        actions: commands,
        slug: 'ada',
        path: 'note.md',
        name: 'note.md',
        t: zhTranslate,
      }),
    ),
  );
  return { commands, preferences, storage };
}

describe('shared default-open split button', () => {
  it('opens the Host system default in one click after asking the owner again', async () => {
    const { commands } = await mount([app('other'), app('system', true)]);
    expect(main().getAttribute('aria-label')).toBe('在 Host 上用 SYSTEM 打开（系统默认）: note.md');
    const before = commands.target.mock.calls.length;
    await click(main());
    expect(commands.target.mock.calls.length).toBeGreaterThan(before);
    expect(commands.open).toHaveBeenCalledWith('ada', 'note.md', { application: 'system' });
    expect(container.querySelector('[role="status"]')?.textContent).toBe('打开请求已发送到 Host');
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
  it('a one-time dropdown choice opens that application without changing the default', async () => {
    const { commands, preferences } = await mount([app('other'), app('system', true)]);
    await click(more());
    expect(document.body.textContent).toContain('当前默认：SYSTEM（系统默认）');
    await click(item('app:other'));
    expect(commands.open).toHaveBeenCalledWith('ada', 'note.md', { application: 'other' });
    expect(preferences.get(md)).toBeUndefined();
    expect(main().getAttribute('aria-label')).toContain('SYSTEM');
  });
  it('sets an explicit default, uses it for the main action, and restores the system default', async () => {
    const { commands, preferences } = await mount([app('other'), app('system', true)]);
    await click(more());
    expect(item('restore')).toBeNull();
    await click(item('set-default'));
    await click(item('default:other'));
    expect(preferences.get(md)).toEqual({ application: 'other', name: 'OTHER' });
    expect(commands.open).not.toHaveBeenCalled();
    expect(container.textContent).toContain('已将 OTHER 设为 .md 文件的默认应用');
    expect(main().getAttribute('aria-label')).toBe('在 Host 上用 OTHER 打开（你的默认）: note.md');
    await click(main());
    expect(commands.open).toHaveBeenLastCalledWith('ada', 'note.md', { application: 'other' });
    await click(more());
    expect(document.body.textContent).toContain('当前默认：OTHER（你的设置）');
    await click(item('restore'));
    expect(preferences.get(md)).toBeUndefined();
    expect(main().getAttribute('aria-label')).toContain('SYSTEM 打开（系统默认）');
  });
  it('without a trusted default it explains and expands the choice instead of opening the first application', async () => {
    const { commands } = await mount([app('finder'), app('vscode')], {
      path: '/host/project',
      relativePath: '',
      kind: 'directory',
    });
    expect(main().getAttribute('aria-label')).toContain('没有可信的默认应用');
    await click(main());
    expect(commands.open).not.toHaveBeenCalled();
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(document.body.textContent).toContain('没有可信的默认应用，请选择一个');
    await click(item('set-default'));
    await click(item('default:vscode'));
    expect(container.textContent).toContain('已将 VSCODE 设为文件夹的默认应用');
    await click(main());
    expect(commands.open).toHaveBeenCalledWith('ada', 'note.md', { application: 'vscode' });
  });
  it('a preferred application that the Host no longer reports is not silently replaced', async () => {
    const storage = memoryStorage();
    const seed = createFileOpenPreferences({ storage, context: async () => ({ profileId: 'p1' }) });
    await seed.ready();
    seed.set(md, { application: 'removed', name: 'Removed' });
    const { commands } = await mount([app('system', true)], undefined, storage);
    expect(main().getAttribute('aria-label')).toContain('默认应用 Removed 在 Host 上不可用');
    await click(main());
    expect(commands.open).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('默认应用 Removed 在 Host 上不可用，请重新选择');
    expect(item('restore')).not.toBeNull();
  });
  it('revalidates on each gesture: an application uninstalled after render is not launched', async () => {
    const { commands } = await mount([app('system', true)]);
    commands.applications.mockResolvedValue({ available: true, applications: [app('other')] });
    await click(main());
    expect(commands.open).not.toHaveBeenCalled();
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
  });
  it('reports owner refusal, launch failure and a failed preference save truthfully', async () => {
    const { commands } = await mount([app('system', true)], undefined, memoryStorage(true));
    await click(more());
    await click(item('set-default'));
    await click(item('default:system'));
    expect(document.body.textContent).toContain('默认应用设置未保存：quota exceeded');
    expect(document.body.textContent).not.toContain('已将 SYSTEM 设为');
    await click(item('back'));
    await click(item('copy'));
    commands.open.mockRejectedValueOnce(new Error('application could not be launched'));
    await click(main());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'application could not be launched',
    );
    commands.target.mockRejectedValue(new Error('Workspace Grant is missing or revoked'));
    await click(main());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Workspace Grant is missing or revoked',
    );
    expect(commands.open).toHaveBeenCalledTimes(1);
  });
});
