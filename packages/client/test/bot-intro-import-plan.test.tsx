// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { ImportableSession, SessionBotInput } from '@botharness/host-client/session-bot';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives, shellPrimitives } = await import('./primitive-mocks.js');
  return {
    ...shellPrimitives(),
    ...dialogPrimitives(),
    relativeTime: () => ({ unit: 'minutes', n: 5 }),
  };
});

import { ImportPlan } from '../src/client/bot-intro-import-plan.js';
import { zhTranslate as t } from '../src/client/locale.js';

const row = (
  sessionId: string,
  folder: string,
  at: number,
  extra: Partial<ImportableSession> = {},
): ImportableSession => ({
  sessionId,
  source: { kind: 'native' },
  product: 'claude-code',
  title: `title ${sessionId}`,
  folderName: folder,
  cwd: `/work/${folder}`,
  workspacePath: `/work/${folder}`,
  running: false,
  lastPromptAt: at,
  updatedAt: at,
  ...extra,
});

const rows: ImportableSession[] = [
  ...Array.from({ length: 6 }, (_, index) => row(`api-${index}`, 'api', 100 - index)),
  ...Array.from({ length: 4 }, (_, index) => row(`web-${index}`, 'web', 90 - index)),
  row('notes-0', 'notes', 10, { addsWorkspace: true }),
  row('notes-1', 'notes', 5, { addsWorkspace: true }),
].sort((a, b) => (b.lastPromptAt ?? 0) - (a.lastPromptAt ?? 0));

async function mount(add: (input: SessionBotInput) => Promise<unknown>) {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const onStart = vi.fn();
  const onDone = vi.fn();
  await act(() => root.render(createElement(ImportPlan, { rows, t, add, onStart, onDone })));
  const q = <E extends Element = HTMLElement>(selector: string, scope: ParentNode = node) =>
    scope.querySelector<E & HTMLElement>(selector)!;
  const bots = () =>
    [...node.querySelectorAll<HTMLElement>('[data-import-bot]')].map((item) => ({
      item,
      name: item.querySelector('input')!.value,
    }));
  const type = async (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const click = async (element: HTMLElement) => act(() => element.click());
  return {
    node,
    q,
    bots,
    type,
    click,
    onStart,
    onDone,
    unmount: async () => {
      await act(() => root.unmount());
      node.remove();
    },
  };
}

it('plans one Bot per folder from the 10 most recent sessions and lets the Human reshape it', async () => {
  const add = vi.fn(async (_input: SessionBotInput) => ({}));
  const view = await mount(add);
  try {
    expect(view.bots().map((bot) => bot.name)).toEqual(['api', 'web']);
    expect(view.bots()[0]!.item.textContent).toContain('6 个会话 · api');
    expect(view.bots()[1]!.item.textContent).toContain('4 个会话 · web');
    expect(view.q('[data-intro-import-create]').textContent).toBe('创建 2 个 Bot');

    const web = view.bots()[1]!.item;
    await view.click(view.q('[data-import-bot-edit]', web));
    const editor = view.q('[data-import-bot-sessions]', web);
    const folderBox = (path: string) =>
      view.q<HTMLInputElement>(`[data-import-folder="${path}"] input[type="checkbox"]`, editor);
    expect(folderBox('/work/web').checked).toBe(true);
    expect(folderBox('/work/api').checked).toBe(false);
    await view.click(folderBox('/work/notes'));
    expect(view.bots()[1]!.item.textContent).toContain('6 个会话 · web、notes');

    await view.click(view.q('[data-import-folder-toggle="/work/api"]', editor));
    await view.click(view.q('[data-import-session="api-5"] input[type="checkbox"]', editor));
    expect(view.bots()[1]!.item.textContent).toContain('7 个会话 · api、web、notes');
    expect(folderBox('/work/api').indeterminate).toBe(true);
    await view.click(folderBox('/work/web'));
    expect(view.bots()[1]!.item.textContent).toContain('3 个会话 · api、notes');

    await view.click(view.q('[data-import-bot-add]'));
    expect(view.bots()).toHaveLength(3);
    expect(view.q<HTMLButtonElement>('[data-intro-import-create]').disabled).toBe(true);
    const fresh = view.bots()[2]!.item;
    await view.type(fresh.querySelector('input')!, 'Writer');
    await view.click(
      view.q(
        '[data-import-folder="/work/web"] input[type="checkbox"]',
        view.q('[data-import-bot-sessions]', fresh),
      ),
    );
    await view.click(view.q('[data-import-bot-remove]', view.bots()[0]!.item));
    expect(view.bots().map((bot) => bot.name)).toEqual(['web', 'Writer']);
    expect(view.q('[data-intro-import-create]').textContent).toBe('创建 2 个 Bot');

    await view.click(view.q('[data-intro-import-create]'));
    await act(async () => {});
    expect(view.onStart).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledTimes(2);
    const [first, second] = add.mock.calls.map(([input]) => input);
    expect(first).toMatchObject({
      displayName: 'web',
      sessionIds: ['api-5', 'notes-0', 'notes-1'],
      workspacePaths: ['/work/api', '/work/notes'],
      addWorkspaces: true,
      language: 'zh',
    });
    expect(second).toMatchObject({
      displayName: 'Writer',
      sessionIds: ['web-0', 'web-1', 'web-2', 'web-3'],
      workspacePaths: ['/work/web'],
    });
    expect(second).not.toHaveProperty('addWorkspaces');
    expect(first!.operationKey).not.toBe(second!.operationKey);
    expect(view.onDone).toHaveBeenCalledWith(2);
  } finally {
    await view.unmount();
  }
});

it('keeps created Bots, and retries only the rest with the same operation key', async () => {
  let fail = true;
  const add = vi.fn(async (input: SessionBotInput) => {
    if (input.displayName === 'web' && fail) throw new Error('offline');
    return {};
  });
  const view = await mount(add);
  try {
    await view.click(view.q('[data-intro-import-create]'));
    await act(async () => {});
    expect(add).toHaveBeenCalledTimes(2);
    expect(view.q('[data-intro-import-create-failed]')).not.toBeNull();
    expect(view.bots()[0]!.item.hasAttribute('data-import-bot-created')).toBe(true);
    expect(view.bots()[0]!.item.querySelector('input')!.disabled).toBe(true);
    expect(view.q('[data-intro-import-create]').textContent).toBe('创建 1 个 Bot');
    expect(view.onDone).not.toHaveBeenCalled();

    fail = false;
    await view.click(view.q('[data-intro-import-create-failed] button'));
    await act(async () => {});
    expect(add).toHaveBeenCalledTimes(3);
    const keys = add.mock.calls.map(([input]) => input.operationKey);
    expect(keys[2]).toBe(keys[1]);
    expect(add.mock.calls.map(([input]) => input.displayName)).toEqual(['api', 'web', 'web']);
    expect(view.onDone).toHaveBeenCalledWith(2);
  } finally {
    await view.unmount();
  }
});
