// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  EngineChoice,
  type EngineApi,
  type EngineRole,
  type EnginesView,
  parseEngines,
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
  const tab = { opener: window as unknown, closed: false, location: { href: '' }, close: vi.fn() };
  const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
  const login = vi.fn(async () => ({ url: 'https://claude.ai/oauth/authorize?x=1' }));
  try {
    await render({ read: async () => view, use: async () => {}, login });
    await act(async () => button('Sign in')!.click());
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(login).toHaveBeenCalledWith('claude');
    expect(tab.location.href).toBe('https://claude.ai/oauth/authorize?x=1');
    expect(tab.opener).toBeNull();
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

it('shows the sign-in link when the browser blocked the sign-in tab', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  try {
    await render({
      read: async () => local(),
      use: async () => {},
      login: async () => ({ url: 'https://claude.ai/oauth/authorize?x=2' }),
    });
    await act(async () => button('Sign in')!.click());
    const link = node.querySelector<HTMLAnchorElement>('a[href]');
    expect(link?.href).toBe('https://claude.ai/oauth/authorize?x=2');
    expect(link?.textContent).toBe('Open the sign-in page');
  } finally {
    open.mockRestore();
  }
});

it('keeps Sign in next to Use model when the chosen engine signed out', async () => {
  await render({
    read: async () => ({
      engines: [{ engine: 'codex', available: false, reason: 'signed-out', installed: true }],
      selections: [{ botSlug: 'ada', role: 'orchestrator', engine: 'codex' }],
    }),
    use: async () => {},
    login: async () => ({}),
  });
  expect(button('Sign in')).toBeDefined();
  expect(button('Use model')).toBeDefined();
  expect(node.textContent).toContain('In use · Signed out');
});

it('shows a reload after the Host took the change but the status read failed', async () => {
  let fail = false;
  let view = local();
  const read = vi.fn(async () => {
    if (fail) throw new Error('offline');
    return view;
  });
  const use = vi.fn(async () => {
    view = local('codex');
    fail = true;
  });
  await render({ read, use, login: async () => ({}) });
  const codex = [...node.querySelectorAll<HTMLElement>('button')].find(
    (item) => item.textContent?.includes('Codex') && !item.textContent.includes('Claude'),
  )!;
  await act(async () => codex.click());
  await act(async () => {
    await Promise.resolve();
  });
  expect(node.textContent).toContain('Couldn’t read Subscription Engines');
  fail = false;
  await act(async () => button('Reload')!.click());
  expect(use).toHaveBeenCalledTimes(1);
  expect(node.textContent).toContain('In use · Signed in');
});

it('ignores a status read that started before a change', async () => {
  let resolveOld: ((value: EnginesView) => void) | undefined;
  let calls = 0;
  const read = vi.fn(
    () =>
      new Promise<EnginesView>((resolve) => {
        calls += 1;
        if (calls === 2) resolveOld = resolve;
        else resolve(calls === 1 ? local() : local('codex'));
      }),
  );
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  vi.useFakeTimers();
  try {
    await render({ read, use: async () => {}, login: async () => ({}) });
    await act(async () => button('Sign in')!.click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    const codex = [...node.querySelectorAll<HTMLElement>('button')].find(
      (item) => item.textContent?.includes('Codex') && !item.textContent.includes('Claude'),
    )!;
    await act(async () => codex.click());
    expect(node.textContent).toContain('In use');
    await act(async () => resolveOld?.(local()));
    expect(node.textContent).toContain('In use');
  } finally {
    open.mockRestore();
    vi.useRealTimers();
  }
});

it('rejects a malformed status body at the boundary', () => {
  expect(() => parseEngines({ engines: null, selections: [] })).toThrow();
  expect(
    parseEngines({
      engines: [{ engine: 'codex', available: false, installed: true }, { engine: 'other' }],
      selections: [{ botSlug: 'ada', role: 'orchestrator', engine: 'codex' }, { botSlug: 1 }],
    }),
  ).toEqual({
    engines: [{ engine: 'codex', available: false, reason: 'login-unknown', installed: true }],
    selections: [{ botSlug: 'ada', role: 'orchestrator', engine: 'codex' }],
  });
});

it('stops waiting for sign-in after three minutes even when a status read hangs', async () => {
  let calls = 0;
  const read = vi.fn(() => {
    calls += 1;
    return calls === 1 ? Promise.resolve(local()) : new Promise<EnginesView>(() => {});
  });
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  vi.useFakeTimers();
  try {
    await render({ read, use: async () => {}, login: async () => ({ url: 'https://x.test' }) });
    await act(async () => button('Sign in')!.click());
    expect(button('Waiting for sign-in')).toBeDefined();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3 * 60_000);
    });
    expect(button('Waiting for sign-in')).toBeUndefined();
    expect(button('Sign in')).toBeDefined();
    expect(read).toHaveBeenCalledTimes(2);
  } finally {
    open.mockRestore();
    vi.useRealTimers();
  }
});
