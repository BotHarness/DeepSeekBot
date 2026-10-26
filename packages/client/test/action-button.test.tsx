// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) =>
    createElement('button', props, children),
  IconRefreshOutlineRegular: () => createElement('svg'),
}));
import { ActionButton } from '../src/client/ds/action-button.js';
import { ReadFailure } from '../src/client/ds/read-failure.js';
it('keeps the action name, disables pending actions, and preserves callbacks', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const run = vi.fn();
  try {
    await act(async () =>
      root.render(
        <ActionButton icon="archive" busy onClick={run}>
          压缩上下文
        </ActionButton>,
      ),
    );
    const button = host.querySelector('button')!;
    expect(button.textContent).toBe('压缩上下文');
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
    await act(async () => button.click());
    expect(run).not.toHaveBeenCalled();
    await act(async () =>
      root.render(
        <ReadFailure retryLabel="重新加载" onRetry={run}>
          读取失败
        </ReadFailure>,
      ),
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('读取失败');
    await act(async () => host.querySelector('button')!.click());
    expect(run).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
