// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  const { createElement: element } = await import('react');
  return {
    ...dialogPrimitives(),
    Checkbox: (props: {
      checked: boolean;
      disabled?: boolean;
      label: string;
      onChange(next: boolean): void;
    }) =>
      element(
        'label',
        null,
        element('input', {
          type: 'checkbox',
          checked: props.checked,
          disabled: props.disabled,
          onChange: (event: { target: HTMLInputElement }) => props.onChange(event.target.checked),
        }),
        props.label,
      ),
    IconCloseOutlineRegular: () => element('span'),
    IconChevronDownOutlineRegular: () => element('span'),
    IconChevronRightOutlineRegular: () => element('span'),
    SegmentedControl: () => element('span'),
    Tag: (props: { children?: ReactNode }) => element('span', null, props.children),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BridgeCallError } from '../src/client/bridge.js';
import {
  BotZipShareButton,
  BotZipShareDialog,
  botZipError,
  botZipTree,
  formatBotZipSize,
  ImportBotZipModal,
} from '../src/client/bot-zip.js';
import { en, zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';
import type { BotSummary } from '../src/client/store.js';
import { buttonNamed } from './primitive-mocks.js';

const enTranslate: BotHarnessTranslate = (key, params) => {
  const english: Readonly<Record<string, string>> = en;
  let text: string = english[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {}))
    text = text.replaceAll('{' + name + '}', String(value));
  return text;
};

const mounted: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
});

async function mount(element: ReturnType<typeof createElement>): Promise<HTMLDivElement> {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  mounted.push(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  return host;
}

function button(host: HTMLElement, text: string): HTMLButtonElement {
  return buttonNamed(text, host);
}

async function chooseFile(host: HTMLElement, file: File): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  expect(input.accept).toBe('.zip,application/zip');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

const BOT = { slug: 'ada', displayName: 'Ada' } as BotSummary;

describe('Import from zip', () => {
  it('shows the third-party notice and imports the chosen zip into the section', async () => {
    const importBotZip = vi.fn(async () => BOT);
    const onImported = vi.fn();
    const host = await mount(
      createElement(ImportBotZipModal, {
        actions: { importBotZip } as unknown as BridgeActions,
        sectionId: 'section-work',
        sectionName: '工作流',
        t: zhTranslate,
        onCancel: vi.fn(),
        onImported,
      }),
    );

    expect(host.textContent).toContain('在「工作流」中从 zip 导入 Bot');
    expect(host.textContent).toContain('这是第三方内容');
    expect(host.textContent).toContain('还没有选择文件');
    expect(button(host, '导入').disabled).toBe(true);

    const file = new File([new Uint8Array([0x50, 0x4b])], 'Ada.zip', { type: 'application/zip' });
    await chooseFile(host, file);
    expect(host.textContent).toContain('Ada.zip');
    await act(async () => button(host, '导入').click());

    expect(importBotZip).toHaveBeenCalledWith(file, 'section-work');
    expect(onImported).toHaveBeenCalled();
  });

  it('keeps the dialog open with a clear reason when the Host refuses the zip', async () => {
    const importBotZip = vi.fn(async () => {
      throw new BridgeCallError('unsafe-path', 'Unsafe entry path: ../evil.md');
    });
    const host = await mount(
      createElement(ImportBotZipModal, {
        actions: { importBotZip } as unknown as BridgeActions,
        t: enTranslate,
        onCancel: vi.fn(),
        onImported: vi.fn(),
      }),
    );
    await chooseFile(host, new File(['x'], 'evil.zip'));
    await act(async () => button(host, 'Import').click());

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('unsafe paths');
    expect(host.textContent).not.toContain('../evil.md');
  });

  it('maps every Bot Zip refusal to copy that names the problem', () => {
    expect(botZipError(new BridgeCallError('invalid-zip', 'x'), zhTranslate)).toContain('zip');
    expect(botZipError(new BridgeCallError('too-large', 'x'), zhTranslate)).toContain('100 MB');
    expect(botZipError(new BridgeCallError('empty', 'x'), zhTranslate)).toBe('zip 里没有文件。');
  });
});

const LISTING = {
  files: [
    { path: '.botharness/avatar.png', size: 2048 },
    { path: '.botharness/bot.json', size: 300 },
    { path: 'MEMORY.md', size: 512 },
    { path: 'SOUL.md', size: 900 },
    { path: 'notes/private/diary.md', size: 1200 },
    { path: 'notes/recipes.md', size: 640 },
  ],
  always: ['.botharness/bot.json', '.botharness/avatar.png'],
};

function checkbox(host: HTMLElement, name: string): HTMLInputElement {
  const tree = host.querySelector('[role="tree"]');
  const label = [...(tree?.querySelectorAll('label') ?? [])].find(
    (item) => item.textContent === name,
  );
  const input = label?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (input === null || input === undefined) throw new Error(`No checkbox ${name}`);
  return input;
}

async function toggle(host: HTMLElement, label: string): Promise<void> {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (found === null) throw new Error(`No toggle ${label}`);
  await act(async () => found.click());
}

async function openExport(translate: BotHarnessTranslate = zhTranslate) {
  const botZipFiles = vi.fn(async () => LISTING);
  const exportBotZip = vi.fn(async (..._args: unknown[]) => undefined);
  const host = await mount(
    createElement(BotZipShareButton, {
      bot: BOT,
      actions: { botZipFiles, exportBotZip } as unknown as BridgeActions,
      t: translate,
    }),
  );
  await act(async () => button(host, translate === zhTranslate ? '分享' : 'Share').click());
  return { host, botZipFiles, exportBotZip };
}

describe('Bot Zip file tree', () => {
  it('groups files under folders, folders first, and sizes them', () => {
    const tree = botZipTree(LISTING.files);
    expect(tree.map((node) => node.name)).toEqual(['.botharness', 'notes', 'MEMORY.md', 'SOUL.md']);
    const notes = tree[1]!;
    expect(notes.kind === 'folder' && notes.children.map((node) => node.name)).toEqual([
      'private',
      'recipes.md',
    ]);
    expect(notes.size).toBe(1840);
    expect(formatBotZipSize(300)).toBe('300 B');
    expect(formatBotZipSize(1840)).toBe('1.8 KB');
    expect(formatBotZipSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('Export zip', () => {
  it('reminds about secrets and exports everything by default', async () => {
    const { host, botZipFiles, exportBotZip } = await openExport();

    expect(botZipFiles).toHaveBeenCalledWith('ada');
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('导出 Ada');
    expect(host.textContent).toContain('分享前请先检查');
    expect(host.textContent).toContain('API Key');
    expect(host.textContent).toContain('已选 6 / 6 个文件');
    expect(host.textContent).not.toContain('diary.md');
    expect(exportBotZip).not.toHaveBeenCalled();

    await act(async () => button(host, '导出').click());
    expect(exportBotZip).toHaveBeenCalledWith('ada', 'Ada', {});
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps bot.json and the avatar ticked and locked', async () => {
    const { host } = await openExport();
    await toggle(host, '展开 .botharness');

    expect(checkbox(host, 'bot.json').checked).toBe(true);
    expect(checkbox(host, 'bot.json').disabled).toBe(true);
    expect(checkbox(host, 'avatar.png').disabled).toBe(true);
    expect(checkbox(host, '.botharness/').disabled).toBe(true);
    expect(host.textContent).toContain('始终包含');
  });

  it('exports only the ticked files, and a selection survives collapsing', async () => {
    const { host, exportBotZip } = await openExport();
    await toggle(host, '展开 notes');
    await toggle(host, '展开 private');
    await act(async () => checkbox(host, 'private/').click());

    expect(checkbox(host, 'diary.md').checked).toBe(false);
    expect(checkbox(host, 'notes/').indeterminate).toBe(true);
    await toggle(host, '折叠 notes');
    await toggle(host, '展开 notes');
    expect(checkbox(host, 'notes/').indeterminate).toBe(true);
    expect(checkbox(host, 'recipes.md').checked).toBe(true);

    await act(async () => checkbox(host, 'SOUL.md').click());
    expect(host.textContent).toContain('已选 4 / 6 个文件');

    await act(async () => button(host, '导出').click());
    expect(exportBotZip).toHaveBeenCalledWith('ada', 'Ada', {
      include: ['MEMORY.md', 'notes/recipes.md'],
    });
  });

  it('selects none and all, and refuses to export with nothing chosen', async () => {
    const { host, exportBotZip } = await openExport();

    await act(async () => button(host, '全不选').click());
    expect(host.textContent).toContain('已选 2 / 6 个文件');
    expect(button(host, '导出').disabled).toBe(true);

    await act(async () => checkbox(host, 'notes/').click());
    expect(checkbox(host, 'notes/').checked).toBe(true);
    expect(button(host, '导出').disabled).toBe(false);

    await act(async () => button(host, '全选').click());
    expect(host.textContent).toContain('已选 6 / 6 个文件');
    await act(async () => button(host, '导出').click());
    expect(exportBotZip).toHaveBeenCalledWith('ada', 'Ada', {});
  });

  it('offers Git history only when every file is ticked', async () => {
    const { host, exportBotZip } = await openExport();
    const history = (): HTMLInputElement =>
      [...host.querySelectorAll('label')]
        .find((label) => label.textContent === '包含 Git 历史')!
        .querySelector('input')!;

    expect(host.textContent).toContain('包含 Git 历史');
    expect(history().checked).toBe(false);
    expect(history().disabled).toBe(false);

    await act(async () => history().click());
    expect(history().checked).toBe(true);

    await act(async () => checkbox(host, 'SOUL.md').click());
    expect(history().disabled).toBe(true);
    expect(history().checked).toBe(false);
    expect(host.textContent).toContain('取消勾选了文件时不能包含 Git 历史');

    await act(async () => checkbox(host, 'SOUL.md').click());
    expect(history().disabled).toBe(false);
    await act(async () => button(host, '导出').click());
    expect(exportBotZip).toHaveBeenCalledWith('ada', 'Ada', { history: true });
  });

  it('shows the English tree copy', async () => {
    const { host } = await openExport(enTranslate);
    expect(host.textContent).toContain('Files to export');
    expect(host.textContent).toContain('6 of 6 files selected');
    await toggle(host, 'Expand .botharness');
    expect(host.textContent).toContain('Always included');
  });

  it('says when the file list cannot be read', async () => {
    const botZipFiles = vi.fn(async () => {
      throw new BridgeCallError('not-found', 'gone');
    });
    const host = await mount(
      createElement(BotZipShareButton, {
        bot: BOT,
        actions: { botZipFiles, exportBotZip: vi.fn() } as unknown as BridgeActions,
        t: zhTranslate,
      }),
    );
    await act(async () => button(host, '分享').click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('读取文件列表失败');
    expect(button(host, '导出').disabled).toBe(true);
  });
});

describe('Share from the App Sidebar', () => {
  it('opens the export dialog on mount and reports when it closes', async () => {
    const botZipFiles = vi.fn(async () => LISTING);
    const onClose = vi.fn();
    const host = await mount(
      createElement(BotZipShareDialog, {
        bot: BOT,
        actions: { botZipFiles, exportBotZip: vi.fn() } as unknown as BridgeActions,
        t: zhTranslate,
        onClose,
      }),
    );
    expect(botZipFiles).toHaveBeenCalledWith('ada');
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('导出 Ada');
    await act(async () => button(host, '取消').click());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('Bot Zip dialogs', () => {
  it('imports the chosen zip on Enter and cancels without importing', async () => {
    const importBotZip = vi.fn(async () => BOT);
    const onCancel = vi.fn();
    const host = await mount(
      createElement(ImportBotZipModal, {
        actions: { importBotZip } as unknown as BridgeActions,
        t: zhTranslate,
        onCancel,
        onImported: vi.fn(),
      }),
    );
    const form = host.querySelector('form')!;
    await act(async () => form.requestSubmit());
    expect(importBotZip).not.toHaveBeenCalled();
    await chooseFile(host, new File(['x'], 'Ada.zip'));
    await act(async () => form.requestSubmit());
    expect(importBotZip).toHaveBeenCalledTimes(1);

    await act(async () => button(host, '取消').click());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps the export dialog open with the reason when packing fails', async () => {
    const botZipFiles = vi.fn(async () => LISTING);
    const exportBotZip = vi.fn(async () => {
      throw new BridgeCallError('too-large', 'x');
    });
    const host = await mount(
      createElement(BotZipShareButton, {
        bot: BOT,
        actions: { botZipFiles, exportBotZip } as unknown as BridgeActions,
        t: zhTranslate,
      }),
    );
    await act(async () => button(host, '分享').click());
    await act(async () => button(host, '导出').click());
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('导出失败');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('100 MB');
  });
});
