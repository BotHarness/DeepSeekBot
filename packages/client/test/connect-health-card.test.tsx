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
function render(health: ConnectHealthStatus) {
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  const reload = vi.fn(async () => {});
  act(() => root.render(<ConnectHealthCard t={t} health={health} reloadSnapshot={reload} />));
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
