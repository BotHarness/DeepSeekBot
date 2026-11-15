// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ConnectHealthCard, connectHealthDiagnostic } from '../src/client/connect-health-card.js';
import { zhTranslate as t } from '../src/client/locale.js';
import type { ConnectHealthStatus } from '../../core/src/devices/connect-health-contract.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Button: 'button' }));
const mounted: Array<() => void> = [];
afterEach(() => {
  for (const dispose of mounted.splice(0)) dispose();
  vi.unstubAllGlobals();
});
function render(health: ConnectHealthStatus, fresh = true) {
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  const reload = vi.fn(async () => {});
  act(() =>
    root.render(<ConnectHealthCard t={t} health={health} reloadSnapshot={reload} fresh={fresh} />),
  );
  mounted.push(() => {
    act(() => root.unmount());
    el.remove();
  });
  return { el, reload };
}
it('shows the failed public stage with actionable copy, and retries only on explicit action', async () => {
  const request = vi.fn(async (_url: string, _init?: RequestInit) =>
    Response.json({ health: { state: 'idle' } }),
  );
  vi.stubGlobal('fetch', request);
  const { el, reload } = render({
    state: 'failed',
    stage: 'public',
    code: 'dns',
    checkedAt: '2026-11-14T00:00:00.000Z',
    elapsedMs: 120,
  });
  expect(el.textContent).toContain('地址解析失败');
  expect(el.textContent).not.toContain('code');
  expect(request).not.toHaveBeenCalled();
  const button = Array.from(el.querySelectorAll('button')).find(
    (button) => button.textContent === '重新检查',
  );
  expect(button).toBeDefined();
  await act(async () => button?.click());
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0]?.[0]).toBe('./api/botharness/devices/connect-health');
  expect(reload).toHaveBeenCalledOnce();
});
it('copies only the allowlisted diagnostic shape, stripping arbitrary server fields', () => {
  const input = {
    state: 'failed',
    stage: 'public',
    code: 'http',
    httpStatus: 530,
    checkedAt: '2026-11-14T00:00:00.000Z',
    elapsedMs: 10,
    email: 'private-account',
    hostname: 'private.example',
    token: 'secret',
    body: 'arbitrary raw text',
  } satisfies ConnectHealthStatus & {
    email: string;
    hostname: string;
    token: string;
    body: string;
  };
  const diagnostic = connectHealthDiagnostic(input);
  expect(JSON.parse(diagnostic)).toEqual({
    version: 1,
    state: 'failed',
    stage: 'public',
    code: 'http',
    httpStatus: 530,
    checkedAt: input.checkedAt,
    elapsedMs: 10,
  });
  expect(diagnostic).not.toContain('private');
  expect(diagnostic).not.toContain('secret');
});
it('renders expired checks as expired instead of keeping a green online promise', () => {
  const { el } = render({ state: 'stale', checkedAt: '2026-11-14T00:00:00.000Z', elapsedMs: 20 });
  expect(el.textContent).toContain('检查结果已过期');
  expect(el.textContent).not.toContain('公网连接已验证');
});
it('does not keep a green result when retry fails, and copied details name the failed request without raw server text', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ token: 'never-copy', body: 'raw server text' }, { status: 503 }),
    ),
  );
  const { el } = render({ state: 'passed', checkedAt: '2026-11-14T00:00:00.000Z', elapsedMs: 10 });
  await act(async () =>
    Array.from(el.querySelectorAll('button'))
      .find((button) => button.textContent === '重新检查')
      ?.click(),
  );
  expect(el.textContent).toContain('暂时无法检查');
  expect(el.textContent).not.toContain('公网连接已验证');
  await act(async () =>
    Array.from(el.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('诊断详情'))
      ?.click(),
  );
  const copy = el.querySelector('[aria-label="复制诊断"]');
  const value = copy?.getAttribute('title') ?? '';
  expect(JSON.parse(value).requestFailure).toMatchObject({ code: 'http', httpStatus: 503 });
  expect(value).not.toContain('never-copy');
  expect(value).not.toContain('raw server');
});

it('does not expose the previous success as current while a retry is pending', async () => {
  let release = (_response: Response) => {};
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    ),
  );
  const { el } = render({ state: 'passed', checkedAt: '2026-11-14T00:00:00Z', elapsedMs: 10 });
  const button = [...el.querySelectorAll('button')].find(
    (button) => button.textContent === '重新检查',
  );
  await act(async () => button?.click());
  expect(el.querySelector('[data-connect-health]')?.getAttribute('data-connect-health')).toBe(
    'checking',
  );
  await act(async () => release(Response.json({ health: { state: 'passed' } })));
});

it('allows recovery from a stale checking snapshot with no local request', () => {
  const { el } = render(
    { state: 'checking', stage: 'public', startedAt: '2026-11-14T00:00:00Z' },
    false,
  );
  const button = [...el.querySelectorAll('button')].find((b) => b.textContent === '重新检查');
  expect(button?.disabled).toBe(false);
  expect(el.textContent).not.toContain('正在检查连接');
});
it('bounds a stalled manual request and restores retry', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_path: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    ),
  );
  try {
    const { el } = render({ state: 'idle' });
    const button = [...el.querySelectorAll('button')].find((b) => b.textContent === '重新检查');
    await act(async () => button?.click());
    await act(async () => vi.advanceTimersByTimeAsync(25000));
    expect(signal?.aborted).toBe(true);
    expect(button?.disabled).toBe(false);
    expect(el.textContent).toContain('暂时无法检查');
  } finally {
    vi.useRealTimers();
  }
});
it('aborts the active manual request when the card unmounts', async () => {
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_path: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    ),
  );
  const { el } = render({ state: 'idle' });
  const button = [...el.querySelectorAll('button')].find((b) => b.textContent === '重新检查');
  await act(async () => button?.click());
  for (const dispose of mounted.splice(0)) dispose();
  expect(signal?.aborted).toBe(true);
});
