// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { comboboxPrimitives, dialogPrimitives } = await import('./primitive-mocks.js');
  const { createElement: element } = await import('react');
  const icon = () => null;
  return {
    ...dialogPrimitives(),
    MenuSurface: comboboxPrimitives().MenuSurface,
    IconCheckOutlineRegular: icon,
    IconCopyOutlineRegular: icon,
    IconDownloadOutlineRegular: icon,
    SegmentedControl: ({ label }: { label: string }) =>
      element('span', { 'data-segmented': label }),
    Checkbox: ({
      checked,
      onChange,
      label,
    }: {
      checked: boolean;
      onChange(next: boolean): void;
      label: string;
    }) =>
      element(
        'label',
        null,
        element('input', { type: 'checkbox', checked, onChange: () => onChange(!checked) }),
        label,
      ),
    IconCheckCircleOutlineRegular: icon,
    IconCloseOutlineRegular: icon,
    IconEditOutlineRegular: icon,
    IconFullscreenOutlineRegular: icon,
    IconLinkOutlineRegular: icon,
    IconPaperclipOutlineRegular: icon,
    IconShieldOutlineRegular: icon,
  };
});
vi.mock('../src/client/ds/select.js', async () => {
  const { createElement: element } = await import('react');
  return {
    Select: ({ label, value }: { label: string; value: string }) =>
      element('span', { 'data-select': label }, value),
  };
});
const { domToBlob } = vi.hoisted(() => ({
  domToBlob: vi.fn(async (): Promise<Blob | null> => new Blob(['page'], { type: 'image/png' })),
}));
vi.mock('modern-screenshot', () => ({ domToBlob }));
vi.mock('../src/client/diagnostic-log.js', () => ({
  clientLog: () => undefined,
  logClient: () => {},
}));

import { BugReportDialog } from '../src/client/bug-report-dialog.js';
import { zhTranslate as t } from '../src/client/locale.js';
import { buttonNamed, dialog, fieldNamed, typeInto } from './primitive-mocks.js';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function pick(files: File[]) {
  const input = dialog().querySelector<HTMLInputElement>('[data-bug-report-picker]')!;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

it('collects picked and pasted files, enforces 25 MB, and hands off to GitHub', async () => {
  const onClose = vi.fn();
  await act(async () => root.render(createElement(BugReportDialog, { onClose, t })));
  const github = buttonNamed('去 GitHub 提交');
  expect(github.disabled).toBe(true);
  await typeInto(fieldNamed('标题'), 'Group chat keeps loading');
  expect(buttonNamed('去 GitHub 提交').disabled).toBe(false);

  await pick([new File(['log'], 'console.txt', { type: 'text/plain' })]);
  const paste = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(paste, 'clipboardData', {
    value: { files: [new File(['png'], 'image.png', { type: 'image/png' })] },
  });
  await act(async () => document.dispatchEvent(paste));
  expect(paste.defaultPrevented).toBe(true);
  const names = [...dialog().querySelectorAll('[data-bug-report-file]')].map((item) =>
    item.getAttribute('data-bug-report-file'),
  );
  expect(names[0]).toBe('console.txt');
  expect(names[1]).toMatch(/^pasted-\d{8}-\d{6}\.png$/u);

  await pick([new File([new Uint8Array(25 * 1024 * 1024)], 'huge.mov')]);
  expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('超过 25 MB');
  expect(buttonNamed('去 GitHub 提交').disabled).toBe(true);
  await act(async () => buttonNamed('移除 huge.mov').click());
  expect(dialog().querySelector('[role="alert"]')).toBeNull();

  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const form = init.body as FormData;
    expect(form.get('title')).toBe('Group chat keeps loading');
    expect(form.get('hours')).toBe('24');
    expect(form.getAll('attachment')).toHaveLength(2);
    return new Response(new Blob(['PK']), {
      headers: {
        'x-bug-report-file': 'tobs-report-2026-11-09-22-13.zip',
        'x-bug-report-issue-url':
          'https://github.com/BotHarness/DeepSeekBot/issues/new?template=01-bug.yml',
      },
    });
  });
  vi.stubGlobal('fetch', fetcher);
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await act(async () => buttonNamed('去 GitHub 提交').click());
  expect(fetcher).toHaveBeenCalledWith(
    './api/botharness/bug-report',
    expect.objectContaining({ method: 'POST' }),
  );
  expect(click).toHaveBeenCalled();
  expect(dialog().textContent).toContain('tobs-report-2026-11-09-22-13.zip');
  const link = dialog().querySelector<HTMLAnchorElement>('[data-bug-report-issue]')!;
  expect(link.href).toContain('template=01-bug.yml');
  expect(link.target).toBe('_blank');
  await act(async () => buttonNamed('完成').click());
  expect(onClose).toHaveBeenCalled();
});

it('shows the Host refusal and keeps the form', async () => {
  await act(async () => root.render(createElement(BugReportDialog, { onClose: () => {}, t })));
  await typeInto(fieldNamed('标题'), 'x');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ error: { code: 'report-too-large' } }, { status: 413 })),
  );
  await act(async () => buttonNamed('下载报告包').click());
  expect(dialog().querySelector('[role="status"]')?.textContent).toContain('超过 25 MB');
  expect(dialog().getAttribute('aria-label')).toBe('报告问题');
  expect(fieldNamed('标题').value).toBe('x');
});

it('opens the logs from the report and comes back with the draft intact', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ entries: [] })),
  );
  await act(async () => root.render(createElement(BugReportDialog, { onClose: () => {}, t })));
  await typeInto(fieldNamed('标题'), 'draft');
  await act(async () => buttonNamed('查看日志').click());
  expect(document.querySelector('[data-diagnostic-logs]')).not.toBeNull();
  expect(document.querySelector('[data-bug-report="form"]')).toBeNull();
  await act(async () => buttonNamed('返回报告').click());
  expect(document.querySelector('[data-bug-report="form"]')).not.toBeNull();
  expect(fieldNamed('标题').value).toBe('draft');
});

it('says what to do when the Host cannot read the diagnostic log', async () => {
  await act(async () => root.render(createElement(BugReportDialog, { onClose: () => {}, t })));
  await typeInto(fieldNamed('标题'), 'x');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ error: { code: 'persistence-unavailable' } }, { status: 503 }),
    ),
  );
  await act(async () => buttonNamed('下载报告包').click());
  const notice = dialog().querySelector('[role="status"]')?.textContent ?? '';
  expect(notice).toContain('取消勾选');
  expect(notice).not.toContain('persistence-unavailable');
});

it('marks up an image attachment and replaces it with the annotated PNG', async () => {
  const drawn: string[] = [];
  const context = new Proxy(
    {},
    {
      get: (_target, key) =>
        typeof key === 'string' && !['strokeStyle', 'fillStyle', 'lineWidth'].includes(key)
          ? (..._args: unknown[]) => drawn.push(key)
          : undefined,
      set: () => true,
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) =>
    done(new Blob(['png'], { type: 'image/png' })),
  );
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 800;
      naturalHeight = 600;
      onload: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  await act(async () => root.render(createElement(BugReportDialog, { onClose: () => {}, t })));
  await pick([
    new File(['png'], 'shot.png', { type: 'image/png' }),
    new File(['log'], 'console.txt', { type: 'text/plain' }),
  ]);
  expect(dialog().querySelector('[data-bug-report-annotate="console.txt"]')).toBeNull();
  await act(async () => buttonNamed('标注 shot.png').click());
  expect(document.querySelector('[data-bug-report="annotate"]')).not.toBeNull();
  await act(async () => {});
  const canvas = dialog().querySelector<HTMLCanvasElement>('[data-annotate-canvas]')!;
  expect(canvas.width).toBe(800);
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300 }) as DOMRect;
  await act(async () => buttonNamed('遮挡').click());
  expect(buttonNamed('遮挡').getAttribute('aria-pressed')).toBe('true');
  const pointer = (type: string, x: number, y: number) =>
    canvas.dispatchEvent(
      Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }), {
        pointerId: 1,
      }),
    );
  await act(async () => {
    pointer('pointerdown', 10, 10);
    pointer('pointermove', 60, 40);
    pointer('pointerup', 60, 40);
  });
  expect(drawn).toContain('fillRect');
  expect(buttonNamed('撤销').disabled).toBe(false);
  await act(async () => buttonNamed('完成').click());
  expect(document.querySelector('[data-bug-report="form"]')).not.toBeNull();
  const names = [...dialog().querySelectorAll('[data-bug-report-file]')].map((item) =>
    item.getAttribute('data-bug-report-file'),
  );
  expect(names).toEqual(['shot-annotated.png', 'console.txt']);
});

it('keeps the original attachment when markup is cancelled', async () => {
  await act(async () => root.render(createElement(BugReportDialog, { onClose: () => {}, t })));
  await pick([new File(['png'], 'shot.png', { type: 'image/png' })]);
  await act(async () => buttonNamed('标注 shot.png').click());
  expect(buttonNamed('完成').disabled).toBe(true);
  await act(async () => buttonNamed('取消').click());
  expect(dialog().querySelector('[data-bug-report-file="shot.png"]')).not.toBeNull();
});

it('steps the report aside for a screenshot dock that adds several marked-up captures', async () => {
  const texts: string[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    new Proxy(
      {},
      {
        get: (_target, key) =>
          key === 'measureText'
            ? () => ({ width: 40 })
            : key === 'fillText'
              ? (value: string) => texts.push(value)
              : typeof key === 'string' &&
                  !['strokeStyle', 'fillStyle', 'lineWidth', 'font'].includes(key)
                ? () => {}
                : undefined,
        set: () => true,
      },
    ) as never,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) =>
    done(new Blob(['png'], { type: 'image/png' })),
  );
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 800;
      naturalHeight = 600;
      onload: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  vi.stubGlobal('requestAnimationFrame', (next: FrameRequestCallback) => {
    next(0);
    return 0;
  });
  domToBlob.mockClear();
  await act(async () => root.render(createElement(BugReportDialog, { onClose: () => {}, t })));
  await act(async () => buttonNamed('截图并标注').click());
  expect(document.querySelector('[data-bug-report="form"]')).toBeNull();
  const dock = () => document.querySelector<HTMLElement>('[data-bug-report-dock]');
  expect(dock()?.getAttribute('role')).toBe('toolbar');
  expect(dock()?.textContent).toContain('已添加 0 张');

  await act(async () => buttonNamed('截图').click());
  await act(async () => {});
  expect(domToBlob).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[data-bug-report="annotate"]')).not.toBeNull();
  expect(dock()?.getAttribute('aria-hidden')).toBe('true');
  const canvas = dialog().querySelector<HTMLCanvasElement>('[data-annotate-canvas]')!;
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300 }) as DOMRect;
  await act(async () => buttonNamed('文字').click());
  await act(async () => {
    canvas.dispatchEvent(
      Object.assign(new MouseEvent('pointerdown', { bubbles: true, clientX: 40, clientY: 30 }), {
        pointerId: 1,
      }),
    );
  });
  const label = dialog().querySelector<HTMLInputElement>('[data-annotate-label]')!;
  await typeInto(label, '这里一直转圈');
  await act(async () =>
    label.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  );
  expect(dialog().querySelector('[data-annotate-label]')).toBeNull();
  expect(texts).toContain('这里一直转圈');
  await typeInto(fieldNamed('一句话说明（可选）'), '发送后卡住');
  await act(async () => buttonNamed('添加到附件').click());
  expect(document.querySelector('[data-bug-report="annotate"]')).toBeNull();
  expect(dock()?.textContent).toContain('已添加 1 张');

  const thumb = dock()!.querySelector<HTMLButtonElement>('[data-bug-report-dock-shot] button')!;
  await act(async () => thumb.click());
  await act(async () => {});
  expect(buttonNamed('撤销').disabled).toBe(false);
  expect(fieldNamed('一句话说明（可选）').value).toBe('发送后卡住');
  await act(async () => buttonNamed('取消').click());
  expect(dock()?.textContent).toContain('已添加 1 张');

  await act(async () => buttonNamed('截图').click());
  await act(async () => {});
  await act(async () => buttonNamed('不要这张').click());
  expect(dock()?.textContent).toContain('已添加 1 张');

  await act(async () => buttonNamed('完成').click());
  expect(dock()).toBeNull();
  const names = [...dialog().querySelectorAll('[data-bug-report-file]')].map((item) =>
    item.getAttribute('data-bug-report-file'),
  );
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/^screenshot-\d{8}-\d{6}-annotated\.png$/u);
  expect(dialog().querySelector('[data-bug-report-note]')?.textContent).toBe('发送后卡住');
  expect(buttonNamed('只下载截图（1）')).toBeDefined();
});

it('keeps the dock open and says so when a capture fails', async () => {
  vi.stubGlobal('requestAnimationFrame', (next: FrameRequestCallback) => {
    next(0);
    return 0;
  });
  domToBlob.mockResolvedValueOnce(null);
  await act(async () => root.render(createElement(BugReportDialog, { onClose: () => {}, t })));
  await act(async () => buttonNamed('截图并标注').click());
  await act(async () => buttonNamed('截图').click());
  await act(async () => {});
  const dock = document.querySelector<HTMLElement>('[data-bug-report-dock]')!;
  expect(dock.getAttribute('aria-hidden')).toBeNull();
  expect(dock.querySelector('[role="alert"]')?.textContent).toContain('没能截图');
  expect(buttonNamed('截图').disabled).toBe(false);
});
