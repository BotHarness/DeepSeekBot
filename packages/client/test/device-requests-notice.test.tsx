// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DeviceRequestsNotice } from '../src/client/device-requests-notice.js';
import { zhTranslate as t } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: 'button',
  relativeTime: () => ({ unit: 'minute', n: 1 }),
}));
vi.mock('../src/client/ds/tooltip.js', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/client/ds/panel-dialog.js', () => ({
  PanelDialog: ({ children, onClose }: { children: ReactNode; onClose(): void }) => (
    <div role="dialog">
      {children}
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

it('shows a persistent request entry without opening a modal; closing leaves the exact request pending', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const pending = {
    receipt: 'receipt',
    publicKey: 'ab'.repeat(32),
    name: 'QA browser',
    approved: false,
  };
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({
      host: { id: 'local', name: 'Local' },
      devices: [],
      pendingKeys: [pending],
      routes: { routes: [], tailscale: 'missing', serveCommand: '' },
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<DeviceRequestsNotice t={t} />));
    const entry = () =>
      host.querySelector<HTMLButtonElement>(`button[aria-label="${t('connections.pending')}"]`)!;
    expect(entry()).not.toBeNull();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => entry().click());
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(host.textContent).toContain('QA browser');
    const close = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Close',
    )!;
    await act(async () => close.click());
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(entry()).not.toBeNull();
    await act(async () => entry().click());
    expect(host.textContent).toContain('QA browser');
    expect(
      fetcher.mock.calls.every((call) => call.length < 2 || !('method' in (call[1] ?? {}))),
    ).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
