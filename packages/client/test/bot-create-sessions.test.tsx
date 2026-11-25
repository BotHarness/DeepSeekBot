// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives, shellPrimitives } = await import('./primitive-mocks.js');
  return {
    ...shellPrimitives(),
    ...dialogPrimitives(),
    relativeTime: () => ({ unit: 'minutes', n: 5 }),
  };
});

import type { ImportableSession } from '@botharness/host-client/session-bot';
import { CreateBotFromSessionsModal } from '../src/client/bot-create-sessions.js';
import { zhTranslate as t } from '../src/client/locale.js';

const now = Date.now();
const row = (
  sessionId: string,
  cwd: string,
  minutes: number,
  title?: string,
): ImportableSession => ({
  sessionId,
  source: { kind: 'native' },
  product: 'deepseek',
  cwd,
  workspacePath: cwd === '/work/app/api' ? '/work/app' : cwd,
  folderName: cwd.split('/').pop()!,
  running: false,
  lastPromptAt: now - minutes * 60_000,
  updatedAt: now - minutes * 60_000,
  ...(title === undefined ? {} : { title }),
});

const rows = [
  row('a1', '/work/app', 5, 'Fix login'),
  row('b1', '/work/docs', 10, 'Write guide'),
  row('a2', '/work/app', 20, 'Add tests'),
  row('a3', '/work/app/api', 30),
];

it('selects the latest Sessions, names the Workspaces to grant and submits the chosen ids', async () => {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const createBotFromSessions = vi.fn(async () => ({}) as never);
  const onCreated = vi.fn();
  try {
    await act(() =>
      root.render(
        createElement(CreateBotFromSessionsModal, {
          t,
          actions: { importableSessions: async () => rows, createBotFromSessions },
          onCancel: vi.fn(),
          onCreated,
        }),
      ),
    );
    await act(async () => {});
    const listed = [...document.body.querySelectorAll('[data-session-row]')].map((item) =>
      item.getAttribute('data-session-row'),
    );
    expect(listed).toEqual(['a1', 'b1', 'a2', 'a3']);
    expect(document.body.textContent).toContain('未命名 Session');

    const latest = document.body.querySelector<HTMLButtonElement>('[data-sessions-latest]')!;
    expect(latest.textContent).toContain('选最近 5 个');
    await act(() => latest.click());
    expect(document.body.querySelector('[data-sessions-selected]')?.textContent).toBe('已选 4 个');
    expect(document.body.querySelector('[data-sessions-grants]')?.textContent).toBe(
      '/work/app/work/docs',
    );

    const name = document.body.querySelector<HTMLInputElement>('input:not([type="checkbox"])')!;
    await act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(name, 'App keeper');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(() => latest.click());
    expect(createBotFromSessions).not.toHaveBeenCalled();
    const docs = document.body.querySelector<HTMLInputElement>(
      '[data-session-row="b1"] input[type="checkbox"]',
    )!;
    await act(() => docs.click());
    expect(document.body.querySelector('[data-sessions-grants]')?.textContent).toBe('/work/app');

    const submit = document.body.querySelector<HTMLButtonElement>('[data-sessions-create]')!;
    expect(submit.textContent).toContain('创建并读取 3 个 Session');
    await act(() => submit.click());
    expect(createBotFromSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'App keeper',
        sessionIds: ['a1', 'a2', 'a3'],
        language: 'zh',
        workspacePaths: ['/work/app'],
      }),
      undefined,
    );
    expect(onCreated).toHaveBeenCalledOnce();
  } finally {
    await act(() => root.unmount());
    node.remove();
  }
});

it('guides to DeepSeek when the computer has no Sessions yet', async () => {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  try {
    await act(() =>
      root.render(
        createElement(CreateBotFromSessionsModal, {
          t,
          actions: { importableSessions: async () => [], createBotFromSessions: vi.fn() },
          onCancel: vi.fn(),
          onCreated: vi.fn(),
        }),
      ),
    );
    await act(async () => {});
    expect(document.body.textContent).toContain('这台电脑上还没有 Session');
    expect(document.body.querySelector<HTMLButtonElement>('[data-sessions-create]')?.disabled).toBe(
      true,
    );
  } finally {
    await act(() => root.unmount());
    node.remove();
  }
});

it('retries a failed creation with the same operation key', async () => {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const createBotFromSessions = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({});
  try {
    await act(() =>
      root.render(
        createElement(CreateBotFromSessionsModal, {
          t,
          actions: { importableSessions: async () => rows, createBotFromSessions },
          onCancel: vi.fn(),
          onCreated: vi.fn(),
        }),
      ),
    );
    await act(async () => {});
    await act(() =>
      document.body.querySelector<HTMLButtonElement>('[data-sessions-latest]')!.click(),
    );
    const name = document.body.querySelector<HTMLInputElement>('input:not([type="checkbox"])')!;
    await act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(name, 'App keeper');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const submit = document.body.querySelector<HTMLButtonElement>('[data-sessions-create]')!;
    await act(async () => submit.click());
    await act(async () => submit.click());
    expect(createBotFromSessions).toHaveBeenCalledTimes(2);
    const [first, second] = createBotFromSessions.mock.calls.map(
      ([input]) => (input as { operationKey: string }).operationKey,
    );
    expect(first).toMatch(/^sessions:/);
    expect(second).toBe(first);
  } finally {
    await act(() => root.unmount());
    node.remove();
  }
});

it('filters to one product and says which session folders become Workspaces', async () => {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const createBotFromSessions = vi.fn(async () => ({}) as never);
  const imported: ImportableSession[] = [
    {
      ...row('claude-code:c1', '/home/me/shop', 1, 'Checkout'),
      product: 'claude-code',
      workspacePath: '/home/me/shop',
      addsWorkspace: true,
    },
    {
      ...row('claude-code:c2', '/home/me/shop/web', 2),
      product: 'claude-code',
      workspacePath: '/home/me/shop/web',
      addsWorkspace: true,
    },
    { ...row('codex:x1', '/work/app', 3, 'Rate limit'), product: 'codex' },
  ];
  try {
    await act(() =>
      root.render(
        createElement(CreateBotFromSessionsModal, {
          t,
          product: 'claude-code',
          actions: {
            importableSessions: async () => [...rows, ...imported],
            createBotFromSessions,
          },
          onCancel: vi.fn(),
          onCreated: vi.fn(),
        }),
      ),
    );
    await act(async () => {});
    const listed = [...document.body.querySelectorAll('[data-session-row]')].map((item) =>
      item.getAttribute('data-session-row'),
    );
    expect(listed).toEqual(['claude-code:c1', 'claude-code:c2']);
    expect(document.body.textContent).toContain('Claude Code · shop');
    await act(() => document.body.querySelector<HTMLButtonElement>('[data-sessions-all]')!.click());
    expect(document.body.querySelector('[data-sessions-grants]')?.textContent).toBe(
      '/home/me/shop（将添加为工作区）',
    );
    const name = document.body.querySelector<HTMLInputElement>('input:not([type="checkbox"])')!;
    await act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(name, 'Shop keeper');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>('[data-sessions-create]')!.click(),
    );
    expect(createBotFromSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionIds: ['claude-code:c1', 'claude-code:c2'],
        workspacePaths: ['/home/me/shop'],
        addWorkspaces: true,
      }),
      undefined,
    );
  } finally {
    await act(() => root.unmount());
    node.remove();
  }
});
