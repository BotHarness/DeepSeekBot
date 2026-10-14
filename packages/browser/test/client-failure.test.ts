// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, onClick }: { children: unknown; onClick?: () => void }) =>
    createElement('button', { type: 'button', onClick }, children as string),
}));

import {
  BrowserApiError,
  BrowserFailureNotice,
  BrowserProvisionProgress,
  readFailure,
} from '../src/client/browser-failure.js';
import { en, zh, type BrowserKey, type BrowserTranslate } from '../src/client/locale.js';
import { BROWSER_FAILURE_KINDS } from '../src/failure-kinds.js';

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function render(node: React.ReactElement): Promise<void> {
  await act(async () => root.render(node));
}

describe('BrowserApiError', () => {
  it('carries code and detail through panel requests, falling back to raw text', () => {
    expect(readFailure(new BrowserApiError('plain', 'provision-no-network', 'raw'))).toEqual({
      message: 'plain',
      code: 'provision-no-network',
      detail: 'raw',
    });
    expect(readFailure(new Error('boom'))).toEqual({ message: 'boom' });
    expect(readFailure('nope')).toEqual({ message: 'nope' });
  });
});

describe('BrowserFailureNotice', () => {
  it.each(BROWSER_FAILURE_KINDS)('renders what, fault, and one action for %s', async (kind) => {
    const t = ((key: BrowserKey) => en[key]) as BrowserTranslate;
    await render(
      createElement(BrowserFailureNotice, {
        failure: { message: 'raw fallback', code: kind, detail: 'raw-code-127' },
        t,
      }),
    );
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(en[`entry.fail.${kind}.title`]);
    expect(alert?.textContent).toContain(en[`entry.fail.${kind}.fault`]);
    expect(alert?.textContent).toContain(en[`entry.fail.${kind}.action`]);
    expect(alert?.textContent).toContain('raw-code-127');
    expect(alert?.textContent).not.toContain('raw fallback');
  });

  it('renders the Chinese triple for the same code', async () => {
    const t = ((key: BrowserKey) => zh[key]) as BrowserTranslate;
    await render(
      createElement(BrowserFailureNotice, {
        failure: { message: 'raw', code: 'provision-no-network', detail: '' },
        t,
      }),
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('本机网络似乎不通');
  });

  it('renders nothing for unknown codes so callers fall back to raw text', async () => {
    const t = ((key: BrowserKey) => en[key]) as BrowserTranslate;
    await render(
      createElement(BrowserFailureNotice, {
        failure: { message: 'raw fallback' },
        t,
      }),
    );
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('BrowserProvisionProgress', () => {
  it('shows percent and MB while downloading', async () => {
    const t = ((key: BrowserKey, params?: Record<string, string | number>) =>
      en[key]
        .replace('{percent}', String(params?.['percent']))
        .replace('{downloaded}', String(params?.['downloaded']))
        .replace('{total}', String(params?.['total']))) as BrowserTranslate;
    await render(
      createElement(BrowserProvisionProgress, {
        progress: { downloadedBytes: 75 * 1024 * 1024, totalBytes: 150 * 1024 * 1024 },
        t,
      }),
    );
    const status = host.querySelector('[role="status"]');
    expect(status?.textContent).toContain('50%');
    expect(status?.textContent).toContain('75.0 MB');
    expect(status?.textContent).toContain('150.0 MB');
    const bar = host.querySelector('progress');
    expect(bar?.getAttribute('value')).toBe(String(75 * 1024 * 1024));
    expect(bar?.getAttribute('max')).toBe(String(150 * 1024 * 1024));
  });

  it('shows a preparing state before the first byte count', async () => {
    const t = ((key: BrowserKey) => en[key]) as BrowserTranslate;
    await render(
      createElement(BrowserProvisionProgress, {
        progress: { downloadedBytes: 0, totalBytes: 0 },
        t,
      }),
    );
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Preparing');
    expect(host.querySelector('progress')).toBeNull();
  });
});

describe('missing system libraries', () => {
  const t = ((key: BrowserKey) => en[key]) as BrowserTranslate;
  const failure = {
    message: 'raw',
    code: 'provision-missing-libs',
    detail: 'missing: libnss3.so',
    packages: ['libnss3'],
  };

  it('installs with one click, shows progress, then opens the browser again', async () => {
    const states = [
      { ok: true, access: 'root' },
      { ok: true, access: 'root', state: 'installing', percent: 40 },
      { ok: true, access: 'root', state: 'installed', percent: 100 },
    ];
    const posted: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          posted.push(JSON.parse(String(init.body)));
          return Response.json({ ok: true, started: true });
        }
        return Response.json(states.length > 1 ? states.shift() : states[0]);
      }),
    );
    const onRetry = vi.fn();
    vi.useFakeTimers();
    try {
      await render(createElement(BrowserFailureNotice, { failure, t, onRetry }));
      await act(async () => vi.advanceTimersByTimeAsync(0));
      const install = [...host.querySelectorAll('button')].find(
        (button) => button.textContent === en['entry.install.button'],
      );
      expect(install).toBeDefined();
      expect(host.textContent).not.toContain('sudo apt install');
      await act(async () => install?.click());
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(posted).toEqual([{ authorize: true, packages: ['libnss3'] }]);
      expect(host.querySelector('progress')).not.toBeNull();
      await act(async () => vi.advanceTimersByTimeAsync(1000));
      expect(onRetry).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the command to copy when installing needs a password', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: true, access: 'none' })),
    );
    await render(createElement(BrowserFailureNotice, { failure, t }));
    await act(async () => undefined);
    expect(host.textContent).toContain('sudo apt install -y libnss3');
    expect(host.textContent).toContain(en['entry.install.copy']);
    expect([...host.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      en['entry.install.copy'],
    ]);
  });
});
