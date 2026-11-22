// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import {
  parseEngines,
  useSubscriptionEngines,
  type EngineApi,
  type EnginesView,
} from '../src/client/engine-choice.js';

const model = { id: 'gpt-6', name: 'GPT-6', efforts: [{ id: 'high', name: 'High' }] };
const local: EnginesView = {
  engines: [
    { engine: 'codex', available: true, installed: true },
    { engine: 'claude', available: false, reason: 'signed-out', installed: true },
  ],
  selections: [],
};

let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  unmount = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function render(overrides: Partial<EngineApi> = {}, enabled = true) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const api: EngineApi = {
    read: async () => local,
    models: async () => [model],
    use: async () => {},
    login: async () => ({}),
    ...overrides,
  };
  let current: ReturnType<typeof useSubscriptionEngines>;
  function Harness() {
    current = useSubscriptionEngines(enabled, api);
    return createElement('div', { ref: current.mount });
  }
  await act(async () => root.render(createElement(Harness)));
  unmount = () => {
    act(() => root.unmount());
    node.remove();
  };
  return () => current;
}

it('loads each available catalog once for both pickers and skips signed-out engines', async () => {
  const models = vi.fn(async () => [model]);
  const state = await render({ models });
  expect(state().models).toEqual({ codex: [model] });
  await act(async () => {
    await state().refresh();
  });
  expect(models).toHaveBeenCalledExactlyOnceWith('codex');
});

it('does not read the origin route from a remote dialog', async () => {
  const read = vi.fn(async () => local);
  await render({ read }, false);
  expect(read).not.toHaveBeenCalled();
});

it('leaves opening the browser to the engine CLI, keeps the link and fetches the catalog after sign-in', async () => {
  vi.useFakeTimers();
  let view = local;
  const open = vi.spyOn(window, 'open');
  const login = vi.fn(async () => ({ url: 'https://claude.ai/oauth/authorize?x=1' }));
  const models = vi.fn(async () => [model]);
  const state = await render({ read: async () => view, login, models });
  await act(async () => state().signIn('claude'));
  expect(login).toHaveBeenCalledWith('claude');
  expect(open).not.toHaveBeenCalled();
  expect(state().signInUrl).toBe('https://claude.ai/oauth/authorize?x=1');
  expect(state().loginUrl).toBe('https://claude.ai/oauth/authorize?x=1');
  expect(state().signingIn).toBe('claude');
  view = {
    ...local,
    engines: [local.engines[0]!, { engine: 'claude', available: true, installed: true }],
  };
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(state().signingIn).toBeUndefined();
  expect(state().signInUrl).toBeUndefined();
  expect(state().models.claude).toEqual([model]);
  expect(models.mock.calls).toEqual([['codex'], ['claude']]);
});

it('keeps the sign-in link and stops polling at three minutes even if a status read hangs', async () => {
  vi.useFakeTimers();
  const read = vi
    .fn()
    .mockResolvedValueOnce(local)
    .mockImplementation(() => new Promise<EnginesView>(() => {}));
  const login = async () => ({ url: 'https://example.test/sign-in' });
  const state = await render({ read, login });
  await act(async () => state().signIn('claude'));
  expect(state().signInUrl).toBe('https://example.test/sign-in');
  await act(async () => vi.advanceTimersByTimeAsync(3 * 60_000));
  expect(state().signingIn).toBeUndefined();
  expect(read).toHaveBeenCalledTimes(2);
});

it('stays pending without a sign-in error when login rejects while cancel is in flight', async () => {
  let rejectLogin: (cause: Error) => void = () => {};
  let settleCancel: () => void = () => {};
  const login = vi.fn(
    () =>
      new Promise<{ url?: string }>((_resolve, reject) => {
        rejectLogin = reject;
      }),
  );
  const cancelLogin = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        settleCancel = resolve;
      }),
  );
  const state = await render({ login, cancelLogin });
  await act(async () => state().signIn('codex'));
  let cancelled: Promise<void> | undefined;
  await act(async () => {
    cancelled = state().cancelSignIn();
  });
  expect(state().cancelling).toBe(true);
  await act(async () => rejectLogin(new Error('aborted')));
  expect(state().signingIn).toBe('codex');
  expect(state().error).toBeUndefined();
  await act(async () => {
    settleCancel();
    await cancelled;
  });
  expect(cancelLogin).toHaveBeenCalledWith('codex', undefined);
  expect(state().cancelling).toBe(false);
  expect(state().signingIn).toBeUndefined();
  expect(state().error).toBeUndefined();
});

it('keeps a sign-in pending past the deadline while cancel is in flight and offers Cancel after it fails', async () => {
  vi.useFakeTimers();
  let rejectCancel: (cause: Error) => void = () => {};
  const cancelLogin = vi.fn(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectCancel = reject;
      }),
  );
  const login = async () => ({ url: 'https://example.test/sign-in' });
  const state = await render({
    read: () => new Promise<EnginesView>(() => {}),
    login,
    cancelLogin,
  });
  await act(async () => state().signIn('codex'));
  let cancelled: Promise<void> | undefined;
  await act(async () => {
    cancelled = state().cancelSignIn();
  });
  await act(async () => vi.advanceTimersByTimeAsync(3 * 60_000 + 1));
  expect(state().signingIn).toBe('codex');
  await act(async () => {
    rejectCancel(new Error('down'));
    await cancelled;
  });
  expect(state().cancelFailed).toBe(true);
  expect(state().cancelling).toBe(false);
  expect(state().signingIn).toBe('codex');
});

it('keeps the committed choice when readback fails and reloads without repeating the write', async () => {
  const selection = {
    botSlug: 'ada',
    role: 'orchestrator' as const,
    engine: 'codex' as const,
    model: 'gpt-6',
    effort: 'high',
  };
  const read = vi
    .fn()
    .mockResolvedValueOnce(local)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ ...local, selections: [selection] });
  const use = vi.fn(async () => {});
  const state = await render({ read, use });
  await act(async () => {
    await state().saveSelection('ada', 'orchestrator', {
      engine: 'codex',
      model: 'gpt-6',
      effort: 'high',
    });
    await state().refresh();
  });
  expect(state().loadFailed).toBe(true);
  expect(state().view?.selections).toEqual([selection]);
  await act(async () => {
    await state().refresh();
  });
  expect(state().loadFailed).toBe(false);
  expect(use).toHaveBeenCalledExactlyOnceWith('ada', 'orchestrator', 'codex', {
    model: 'gpt-6',
    effort: 'high',
  });
});

it('ignores a status read that started before changing the selection', async () => {
  let resolveOld: ((value: EnginesView) => void) | undefined;
  const read = vi
    .fn()
    .mockResolvedValueOnce(local)
    .mockImplementationOnce(
      () =>
        new Promise<EnginesView>((resolve) => {
          resolveOld = resolve;
        }),
    );
  const state = await render({ read });
  await act(async () => {
    void state().refresh();
    await state().saveSelection('ada', 'orchestrator', { engine: 'codex' });
  });
  await act(async () => resolveOld?.(local));
  expect(state().view?.selections).toEqual([
    { botSlug: 'ada', role: 'orchestrator', engine: 'codex' },
  ]);
});

it('rejects malformed status and preserves the role, model, effort and fallback', () => {
  expect(() => parseEngines({ engines: null, selections: [] })).toThrow();
  const choice = {
    botSlug: 'ada',
    role: 'orchestrator',
    engine: 'codex',
    model: 'gpt-6',
    effort: 'high',
    fallback: true,
  };
  expect(
    parseEngines({
      engines: [{ engine: 'codex', available: false, installed: true }, { engine: 'other' }],
      selections: [choice, { botSlug: 1 }],
    }),
  ).toEqual({
    engines: [{ engine: 'codex', available: false, reason: 'login-unknown', installed: true }],
    selections: [choice],
  });
});

it('prefers the account quota snapshot but keeps the status remaining value when the snapshot has none', () => {
  const status = { usedPercent: 40, observedAt: '2026-11-22T00:00:00.000Z' };
  const fresh = {
    observedAt: '2026-11-22T01:00:00.000Z',
    source: 'live',
    windows: { weekly: { remainingPercent: 70 } },
  };
  const empty = { observedAt: '2026-11-22T01:00:00.000Z', source: 'turn', windows: {} };
  const read = (snapshot: unknown) =>
    parseEngines({
      accounts: [{ id: 'codex-a', engine: 'codex', name: 'A', quota: snapshot }],
      engines: [
        { engine: 'codex', accountId: 'codex-a', available: true, installed: true, quota: status },
      ],
      selections: [],
    }).engines[0]?.quota;
  expect(read(fresh)).toEqual({ ...fresh, windows: { weekly: { remainingPercent: 70 } } });
  expect(read(empty)).toEqual(status);
});
