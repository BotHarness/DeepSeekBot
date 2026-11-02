// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ variant: _v, size: _s, ...props }: Record<string, unknown>) => <button {...props} />,
}));
import { zhTranslate } from '../src/client/locale.js';
import type { WindowZoom } from '../src/client/window-zoom.js';
import type { ZoomSurface } from '../src/client/window-zoom-mount.js';
import {
  WindowZoomSetup,
  type WindowZoomSetupHost,
  type WindowZoomSetupStatus,
} from '../src/client/window-zoom-setup.js';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const surface = (owner: WindowZoom | null): ZoomSurface => ({
  getSnapshot: () => owner,
  getErrorSnapshot: () => null,
  subscribe: () => () => {},
});
const fake = (status: WindowZoomSetupStatus, next: WindowZoomSetupStatus = status) => ({
  read: vi.fn<WindowZoomSetupHost['read']>(async () => status),
  request: vi.fn<WindowZoomSetupHost['request']>(async () => next),
});
const render = (setup: WindowZoomSetupHost, owner: WindowZoom | null = null) =>
  act(async () =>
    root.render(<WindowZoomSetup surface={surface(owner)} t={zhTranslate} host={setup} />),
  );
const button = () => host.querySelector('button')!;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it('stays hidden outside the native Desktop Profile', async () => {
  await render(fake({ supported: false, code: 'zoom-setup-not-desktop' }));
  expect(host.textContent).toBe('');
});

it('schedules enable, explains the quit step and can cancel it', async () => {
  const setup = fake(
    { supported: true, enabled: false },
    { supported: true, enabled: false, pending: { action: 'enable', requestedAt: 'now' } },
  );
  await render(setup);
  expect(host.textContent).toContain('启用窗口缩放');
  await act(async () => button().click());
  expect(setup.request).toHaveBeenCalledWith('enable');
  expect(host.textContent).toContain('完全退出应用后会自动启用，并重新打开。');
  expect(button().textContent).toBe('取消');
  setup.request.mockResolvedValueOnce({ supported: true, enabled: false });
  await act(async () => button().click());
  expect(setup.request).toHaveBeenLastCalledWith('cancel');
  expect(button().textContent).toBe('启用');
});

it('offers turning zoom off once installed and shows a failed run', async () => {
  const setup = fake({
    supported: true,
    enabled: true,
    last: { action: 'enable', status: 'failed', code: 'desktop-zoom-setup-theme-conflict' },
  });
  await render(setup);
  expect(host.textContent).toContain('关闭窗口缩放');
  expect(host.textContent).toContain('已启用，重新打开应用后生效。');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'desktop-zoom-setup-theme-conflict',
  );
  await act(async () => button().click());
  expect(setup.request).toHaveBeenCalledWith('disable');
});
