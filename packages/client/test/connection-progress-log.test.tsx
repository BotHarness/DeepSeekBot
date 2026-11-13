// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ConnectionProgressLog,
  connectionProgressRows,
} from '../src/client/connection-progress-log.js';
import { zhTranslate as t } from '../src/client/locale.js';

const row = (id: number, code: string, source = 'private-tunnel') => ({
  id,
  ts: 100 + id,
  source,
  category: 'module',
  level: 'info',
  code,
  fields: { token: 'must-not-render' },
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('shows only bounded phase facts for the selected connection, never command arguments or credentials', () => {
  const rows = connectionProgressRows(
    [
      row(1, 'private-tunnel phase=cloudflared-started route=quick token=secret'),
      row(2, 'private-tunnel phase=verified route=custom url=https://secret.example'),
      row(3, 'private-tunnel phase=verified', 'unrelated'),
      row(4, 'untrusted raw output password=secret'),
    ],
    'private-tunnel',
    101,
  );
  expect(rows).toEqual([
    { id: 2, ts: 102, phase: 'verified', route: 'custom' },
    { id: 1, ts: 101, phase: 'cloudflared-started', route: 'quick' },
  ]);
  expect(
    connectionProgressRows(
      Array.from({ length: 70 }, (_, i) => row(i, 'verified')),
      'private-tunnel',
      0,
    ),
  ).toHaveLength(40);
});
it('updates real retained events, keeps evidence on failure, and stops polling when the preparation view closes', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(100);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ entries: [row(1, 'private-tunnel phase=quick-address route=quick')] }),
    )
    .mockRejectedValue(new Error('offline'));
  vi.stubGlobal('fetch', fetcher);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<ConnectionProgressLog t={t} source="private-tunnel" />));
    expect(host.textContent).toContain(t('connections.log.address'));
    expect(host.textContent).not.toContain('must-not-render');
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(host.textContent).toContain(t('connections.log.unavailable'));
    expect(host.textContent).toContain(t('connections.log.address'));
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
  const calls = fetcher.mock.calls.length;
  await vi.advanceTimersByTimeAsync(6000);
  expect(fetcher).toHaveBeenCalledTimes(calls);
});

it('shows only allowlisted probe details and bounded numeric progress', () => {
  expect(
    connectionProgressRows(
      [
        row(
          1,
          'private-tunnel phase=probe-failed route=quick attempt=3 elapsedMs=12500 probe=dns secret=never',
        ),
      ],
      'private-tunnel',
      0,
    ),
  ).toEqual([
    {
      id: 1,
      ts: 101,
      phase: 'probe-failed',
      route: 'quick',
      attempt: 3,
      seconds: 13,
      probe: 'dns',
    },
  ]);
});

it('localizes failure phases and hides internal phase and HTTP codes', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        entries: [
          { ...row(1, 'private-tunnel phase=origin-port-busy'), ts: Date.now() },
          { ...row(2, 'private-tunnel phase=future-internal-code'), ts: Date.now() },
          { ...row(3, 'private-tunnel phase=probe-failed probe=http-503'), ts: Date.now() },
        ],
      }),
    ),
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<ConnectionProgressLog t={t} source="private-tunnel" />));
    expect(host.textContent).toContain(t('connections.log.portBusy'));
    expect(host.textContent).toContain(t('connections.log.updated'));
    expect(host.textContent).toContain(t('connections.log.http'));
    expect(host.textContent).not.toContain('origin-port-busy');
    expect(host.textContent).not.toContain('future-internal-code');
    expect(host.textContent).not.toContain('http-503');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
