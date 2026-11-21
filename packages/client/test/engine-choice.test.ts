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
