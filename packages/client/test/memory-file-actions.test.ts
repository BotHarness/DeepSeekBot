// @vitest-environment jsdom
import { MessageAttachment } from '../src/client/message-attachment.js';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    FileTypeIcon: stub,
    writeClipboard: vi.fn(async () => true),
    fileSizeText: (bytes: number) =>
      bytes >= 1048576
        ? `${(bytes / 1048576).toFixed(1)}MB`
        : bytes >= 1024
          ? `${(bytes / 1024).toFixed(1)}KB`
          : `${bytes}B`,
    IconEllipsisOutlineRegular: stub,
    IconDownloadOutlineRegular: stub,
    IconPlayOutlineRegular: stub,
    IconPauseOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconFolderCloseRegular: stub,
    IconFolderOpenRegular: stub,
    Tooltip: ({ children }: { children: ReactNode }) => children,
    Menu: ({
      anchor,
      items,
      onSelect,
    }: {
      anchor: ReactNode;
      items: {
        type?: string;
        id: string;
        label?: ReactNode;
        text?: ReactNode;
        disabled?: boolean;
      }[];
      onSelect: (id: string) => void;
    }) =>
      createElement(
        'div',
        { role: 'menu' },
        anchor,
        items.map((item) =>
          item.type
            ? createElement('span', { key: item.id }, item.text)
            : createElement(
                'button',
                {
                  key: item.id,
                  role: 'menuitem',
                  disabled: item.disabled,
                  onClick: () => onSelect(item.id),
                },
                item.label,
              ),
        ),
      ),
  };
});
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';
import { MemoryFileTree } from '../src/client/memory-file-tree.js';
import { WorkspaceFileActionButton } from '../src/client/workspace-file-actions.js';
import { MemoryFileActionButton } from '../src/client/memory-file-actions.js';
import type { HostFileTarget } from '../src/client/host-file-actions.js';
import { zhTranslate } from '../src/client/locale.js';

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
function actions(available = true) {
  return {
    memoryFileTarget: vi.fn(async (_slug: string, path: string): Promise<HostFileTarget> => ({
      path: '/host/memory/' + path,
      relativePath: path,
      kind: path.includes('.') ? 'file' : 'directory',
    })),
    memoryFileApplications: vi.fn(async () => ({
      available,
      applications: available ? [{ id: 'editor', name: 'Editor', default: true, icon: null }] : [],
    })),
    memoryFileOpen: vi.fn(async () => {}),
    memoryFileDownload: vi.fn(async () => {}),
  };
}
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.includes(text),
  )!;
async function click(element: Element) {
  await act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

describe('Memory file menus', () => {
  it('right-click and keyboard menu do not select a file or expand a directory; More is accessible', async () => {
    const a = actions();
    const select = vi.fn();
    await act(async () =>
      root.render(
        createElement(MemoryFileTree, {
          paths: ['nested/file.txt'],
          selectedPath: undefined,
          onSelect: select,
          actions: a,
          botSlug: 'ada',
          t: zhTranslate,
        }),
      ),
    );
    const folder = container.querySelector<HTMLButtonElement>('[role="treeitem"]')!;
    await act(async () =>
      folder.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    );
    expect(folder.getAttribute('aria-expanded')).toBe('false');
    expect(
      container
        .querySelector('button[aria-label="文件操作: nested"]')
        ?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(select).not.toHaveBeenCalled();
    expect(button('用 Editor 打开')).toBeDefined();
    await click(button('用 Editor 打开'));
    expect(a.memoryFileOpen).toHaveBeenCalledWith('ada', 'nested', { application: 'editor' });
    await click(folder);
    const file = container.querySelector<HTMLButtonElement>('[data-path="nested/file.txt"]')!;
    await act(async () =>
      file.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'F10',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(select).not.toHaveBeenCalled();
    expect(
      container
        .querySelector('button[aria-label="文件操作: nested/file.txt"]')
        ?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(
      container
        .querySelector('button[aria-label="文件操作: nested"]')
        ?.getAttribute('aria-expanded'),
    ).toBe('false');
    await click(button('下载到此设备'));
    expect(a.memoryFileDownload).toHaveBeenCalledWith('ada', 'nested/file.txt');
    expect(
      container.querySelector('button[aria-label="文件操作: nested/file.txt"]'),
    ).not.toBeNull();
    await click(file);
    expect(select).toHaveBeenCalledWith('nested/file.txt');
  });
  it('unavailable Host keeps file download and path copy, and never offers unavailable apps', async () => {
    const a = actions(false);
    await act(async () =>
      root.render(
        createElement(MemoryFileActionButton, {
          actions: a,
          slug: 'ada',
          path: 'file.txt',
          text: 'file.txt',
          t: zhTranslate,
        }),
      ),
    );
    await click(button('file.txt'));
    expect(document.body.textContent).toContain('Host 无法原生打开');
    expect(document.body.textContent).not.toContain('用 Editor 打开');
    expect(button('下载到此设备')).toBeDefined();
    expect(button('复制 Host 路径')).toBeDefined();
    const targetCalls = a.memoryFileTarget.mock.calls.length;
    vi.mocked(writeClipboard).mockResolvedValueOnce(false);
    await click(button('复制 Host 路径'));
    expect(document.body.textContent).toContain('无法复制路径');
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    await click(button('复制 Host 路径'));
    expect(writeClipboard).toHaveBeenLastCalledWith('/host/memory/file.txt');
    expect(a.memoryFileTarget).toHaveBeenCalledTimes(targetCalls);
    expect(document.body.textContent).toContain('已复制 Host 路径');
    await click(button('file.txt'));
    await click(button('下载到此设备'));
    expect(a.memoryFileDownload).toHaveBeenCalledWith('ada', 'file.txt');
  });
  it('a rejected or vanished target offers no executable action and shows the error', async () => {
    const a = actions();
    vi.mocked(a.memoryFileTarget).mockRejectedValue(new Error('file is missing'));
    await act(async () =>
      root.render(
        createElement(MemoryFileActionButton, {
          actions: a,
          slug: 'ada',
          path: 'file.txt',
          t: zhTranslate,
        }),
      ),
    );
    await click(container.querySelector('button')!);
    expect(document.body.textContent).toContain('file is missing');
    expect(document.querySelector('[role="menuitem"]')).toBeNull();
    expect(a.memoryFileOpen).not.toHaveBeenCalled();
  });
});

describe('Workspace path menus', () => {
  it('uses Grant identity for click/context/keyboard menus, native directory open and copy; offers no download', async () => {
    const a = {
      workspaceFileTarget: vi.fn(async () => ({
        path: '/host/工程 project',
        relativePath: '',
        kind: 'directory' as const,
      })),
      workspaceFileApplications: vi.fn(async () => ({
        available: true,
        applications: [{ id: 'finder', name: 'Finder', default: false, icon: null }],
      })),
      workspaceFileOpen: vi.fn(async () => {}),
    };
    await act(async () =>
      root.render(
        createElement(WorkspaceFileActionButton, {
          actions: a,
          slug: 'ada',
          grantId: 'grant-1',
          text: '/cached/display/path',
          t: zhTranslate,
        }),
      ),
    );
    const trigger = button('/cached/display/path');
    await click(trigger);
    expect(a.workspaceFileTarget).toHaveBeenCalledWith('ada', 'grant-1');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.body.textContent).not.toContain('下载到此设备');
    await click(button('用 Finder 打开'));
    expect(a.workspaceFileOpen).toHaveBeenCalledWith('ada', 'grant-1', { application: 'finder' });
    await act(async () =>
      trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    );
    await click(button('复制 Host 路径'));
    expect(writeClipboard).toHaveBeenLastCalledWith('/host/工程 project');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await act(async () =>
      trigger.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'F10',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(button('用 Finder 打开')).toBeDefined();
  });
  it('unavailable directory explains copy-only fallback; revoked targets have no executable action', async () => {
    const a = {
      workspaceFileTarget: vi.fn(async () => ({
        path: '/host/project',
        relativePath: '',
        kind: 'directory' as const,
      })),
      workspaceFileApplications: vi.fn(async () => ({ available: false, applications: [] })),
      workspaceFileOpen: vi.fn(async () => {}),
    };
    await act(async () =>
      root.render(
        createElement(WorkspaceFileActionButton, {
          actions: a,
          slug: 'ada',
          grantId: 'grant-1',
          text: 'project',
          t: zhTranslate,
        }),
      ),
    );
    await click(button('project'));
    expect(document.body.textContent).toContain('Host 无法原生打开；可复制路径');
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(1);
    await click(button('复制 Host 路径'));
    a.workspaceFileTarget.mockRejectedValue(new Error('Workspace Grant is missing or revoked'));
    await click(button('project'));
    expect(document.body.textContent).toContain('Workspace Grant is missing or revoked');
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(0);
    expect(a.workspaceFileOpen).not.toHaveBeenCalled();
  });
});

describe('message attachment menus', () => {
  it('uses the captured message owner for file click, context menu and keyboard without opening the bubble menu', async () => {
    const a = {
      messageAttachmentTarget: vi.fn(async () => ({
        path: '/host/files/notes.txt',
        relativePath: 'notes.txt',
        kind: 'file' as const,
      })),
      messageAttachmentApplications: vi.fn(async () => ({
        available: true,
        applications: [{ id: 'editor', name: 'Editor', default: true, icon: null }],
      })),
      messageAttachmentOpen: vi.fn(async () => undefined),
      messageAttachmentDownload: vi.fn(async () => undefined),
    };
    const bubble = vi.fn();
    const attachment = {
      fileId: 'file:00000000-0000-4000-8000-000000000000',
      name: 'notes.txt',
      mime: 'text/plain',
      size: 1,
    };
    await act(async () =>
      root.render(
        createElement(
          'div',
          { onContextMenu: bubble },
          createElement(MessageAttachment, {
            attachment,
            channelId: 'group-owner',
            messageId: 'message-owner',
            actions: a,
            t: zhTranslate,
          }),
        ),
      ),
    );
    const file = container.querySelector('button.bh-message-file-main')!;
    await act(async () =>
      file.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    );
    expect(bubble).not.toHaveBeenCalled();
    expect(a.messageAttachmentTarget).toHaveBeenCalledWith(
      'group-owner',
      'message-owner',
      attachment.fileId,
    );
    await click(button('用 Editor 打开'));
    expect(a.messageAttachmentOpen).toHaveBeenCalledWith(
      'group-owner',
      'message-owner',
      attachment.fileId,
      { application: 'editor' },
    );
    await act(async () =>
      file.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'F10',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await click(button('下载'));
    expect(a.messageAttachmentDownload).toHaveBeenCalledWith(
      'group-owner',
      'message-owner',
      attachment.fileId,
    );
    await click(file);
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    expect(file.getAttribute('aria-haspopup')).toBe('menu');
    const download = container.querySelector('a.bh-message-file-download')!;
    expect(download.getAttribute('aria-label')).toBe('下载到此设备: notes.txt');
    expect(download.getAttribute('href')).toContain('channelId=group-owner');
    expect(download.getAttribute('download')).toBe('notes.txt');
    expect(container.querySelector('.bh-message-file-more')).toBeNull();
  });

  it('renders audio attachments with a custom player instead of native controls', async () => {
    await act(async () =>
      root.render(
        createElement(MessageAttachment, {
          attachment: {
            fileId: 'file:00000000-0000-4000-8000-000000000000',
            name: 'voice.mp3',
            mime: 'audio/mpeg',
            size: 1536,
          },
          channelId: 'group-owner',
          messageId: 'message-owner',
          t: zhTranslate,
        }),
      ),
    );
    const player = container.querySelector('.bh-message-audio')!;
    expect(player.querySelector('button.bh-message-audio-play')?.getAttribute('aria-label')).toBe(
      '播放音频: voice.mp3',
    );
    const spectrum = player.querySelector('.bh-message-audio-spectrum')!;
    expect(spectrum.getAttribute('role')).toBe('slider');
    expect(spectrum.getAttribute('aria-label')).toBe('拖动以快进或后退: voice.mp3');
    expect(player.querySelectorAll('.bh-message-audio-bar')).toHaveLength(48);
    expect(player.textContent).toContain('1.5KB');
    const download = player.querySelector('a.bh-message-file-download')!;
    expect(download.getAttribute('download')).toBe('voice.mp3');
    expect(container.querySelector('audio[controls]')).toBeNull();
    expect(container.querySelector('audio')?.getAttribute('preload')).toBe('metadata');
  });

  it('keeps image preview independent of its accessible actions and uses message-owned URLs', async () => {
    const attachment = {
      fileId: 'file:00000000-0000-4000-8000-000000000000',
      name: 'photo.png',
      mime: 'image/png',
      size: 1,
    };
    await act(async () =>
      root.render(
        createElement(MessageAttachment, {
          attachment,
          channelId: 'group-owner',
          messageId: 'message-owner',
          t: zhTranslate,
        }),
      ),
    );
    const image = container.querySelector('a.bh-message-image-link')!;
    expect(image.getAttribute('href')).toContain(
      'channelId=group-owner&messageId=message-owner&fileId=file%3A',
    );
    expect(image.getAttribute('target')).toBe('_blank');
    expect(container.querySelector('button[aria-label="文件操作: photo.png"]')).not.toBeNull();
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });
});
