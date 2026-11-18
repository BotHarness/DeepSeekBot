// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  EngineChoice,
  type EngineApi,
  type EngineRole,
  type EnginesView,
} from '../src/client/engine-choice.js';
import { en } from '../src/client/locale.js';

const t = (key: string, params?: Record<string, unknown>) =>
  Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    (en as Record<string, string>)[key] ?? key,
  );

let node: HTMLElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
});

afterEach(() => {
  act(() => root.unmount());
  node.remove();
});

const local = (selected?: 'codex' | 'claude'): EnginesView => ({
  engines: [
    { engine: 'codex', available: true, installed: true, version: '0.170.0' },
    { engine: 'claude', available: false, reason: 'signed-out', installed: true },
  ],
  selections:
    selected === undefined ? [] : [{ botSlug: 'ada', role: 'orchestrator', engine: selected }],
});

const render = async (api: EngineApi, role: EngineRole = 'orchestrator') => {
  await act(async () => {
    root.render(createElement(EngineChoice, { slug: 'ada', role, t, api }));
  });
  await act(async () => {
    await Promise.resolve();
  });
};

const rows = () =>
  [...node.querySelectorAll('li')].map((row) => row.textContent?.replace(/\s+/gu, ' ').trim());

const button = (label: string) =>
  [...node.querySelectorAll('button')].find((item) => item.textContent?.includes(label));

it('lists engines with sign-in state and picks a signed-in one for the Orchestrator', async () => {
  let view = local();
  const use = vi.fn(async (_bot: string, _role: EngineRole, engine: 'codex' | 'claude' | null) => {
    view = local(engine ?? undefined);
  });
  await render({ read: async () => view, use, login: async () => ({}) });
  expect(rows()).toEqual([
    expect.stringContaining('Codex'),
    expect.stringContaining('Claude Code'),
  ]);
  expect(node.textContent).toContain('Signed in · 0.170.0');
  expect(node.textContent).toContain('Signed out');
  expect(button('Sign in')?.getAttribute('aria-label')).toBe('Sign in to Claude Code');

  const codex = [...node.querySelectorAll<HTMLElement>('[role="radio"], button')].find(
    (item) => item.textContent?.includes('Codex') && !item.textContent.includes('Claude'),
  )!;
  await act(async () => codex.click());
  await act(async () => {
    await Promise.resolve();
  });
  expect(use).toHaveBeenCalledWith('ada', 'orchestrator', 'codex');
  expect(node.textContent).toContain('In use · Signed in · 0.170.0');
  expect(button('Use model')?.getAttribute('aria-label')).toBe(
    'Stop using Codex and use the model',
  );

  await act(async () => button('Use model')!.click());
  expect(use).toHaveBeenLastCalledWith('ada', 'orchestrator', null);
});

it('starts the official sign-in and polls until the engine is signed in', async () => {
  vi.useFakeTimers();
  let view = local();
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const login = vi.fn(async () => ({ url: 'https://claude.ai/oauth/authorize?x=1' }));
  try {
    await render({ read: async () => view, use: async () => {}, login });
    await act(async () => button('Sign in')!.click());
    expect(login).toHaveBeenCalledWith('claude');
    expect(open).toHaveBeenCalledWith(
      'https://claude.ai/oauth/authorize?x=1',
      '_blank',
      'noopener',
    );
    expect(button('Waiting for sign-in')).toBeDefined();
    view = {
      ...view,
      engines: view.engines.map((entry) =>
        entry.engine === 'claude' ? { engine: 'claude', available: true, installed: true } : entry,
      ),
    };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(button('Sign in')).toBeUndefined();
    expect(node.textContent).not.toContain('Signed out');
  } finally {
    open.mockRestore();
    vi.useRealTimers();
  }
});

it('says why an engine that is not installed cannot be chosen', async () => {
  const use = vi.fn(async () => {});
  await render({
    read: async () => ({
      engines: [{ engine: 'claude', available: false, reason: 'not-installed', installed: false }],
      selections: [],
    }),
    use,
    login: async () => ({}),
  });
  expect(node.textContent).toContain('Claude Code isn’t installed on this computer');
  expect(button('Sign in')).toBeUndefined();
  const row = [...node.querySelectorAll<HTMLElement>('button')].find((item) =>
    item.textContent?.includes('Claude Code'),
  );
  if (row !== undefined) {
    await act(async () => row.click());
    expect(use).not.toHaveBeenCalled();
  }
});

it('explains that a Cloud or VPS Host has no Subscription Engines', async () => {
  await render({
    read: async () => ({ engines: [], selections: [] }),
    use: async () => {},
    login: async () => ({}),
  });
  expect(node.querySelectorAll('li')).toHaveLength(0);
  expect(node.textContent).toContain(
    'Subscription Engines run only on your own computer, not on this Host.',
  );
});

it('shows the Host refusal next to the choice', async () => {
  await render(
    {
      read: async () => local(),
      use: async () => {
        throw new Error('Only the orchestrator role can use an engine now');
      },
      login: async () => ({}),
    },
    'assignment',
  );
  const codex = [...node.querySelectorAll<HTMLElement>('button')].find(
    (item) => item.textContent?.includes('Codex') && !item.textContent.includes('Claude'),
  )!;
  await act(async () => codex.click());
  await act(async () => {
    await Promise.resolve();
  });
  expect(node.textContent).toContain('Only the orchestrator role can use an engine now');
});
