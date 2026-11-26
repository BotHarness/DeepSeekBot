// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/ui/chat/sheet', () => ({ SHEET_GROUP: 'raised' }));
vi.mock('../src/ui/primitives/settings-row', () => ({
  SettingsSection: ({ children, footer }: { children: ReactNode; footer?: string }) => (
    <section data-footer={footer}>{children}</section>
  ),
  SettingsRow: ({
    title,
    detail,
    control,
  }: {
    title: string;
    detail?: string;
    control: { value: boolean; disabled?: boolean; onChange(value: boolean): void };
  }) => (
    <button
      type="button"
      aria-label={title}
      aria-checked={control.value}
      data-detail={detail}
      disabled={control.disabled}
      onClick={() => control.onChange(!control.value)}
    />
  ),
}));
const session = vi.hoisted(() => ({
  saved: { hostId: 'studio' } as { hostId: string; member?: object } | null,
  client: undefined as unknown,
  inbox: { refresh: vi.fn(async () => undefined) },
}));
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => session,
  useHostSnapshot: () => ({ connection: { status: 'connected' } }),
}));

import { SessionRequestsSetting } from '../src/features/sessions/session-requests-setting';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let view: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  view?.remove();
});

function host(value: Record<string, unknown>, refuse = false) {
  let revision = 4;
  let current = value;
  const call = vi.fn(async (method: string, args: Record<string, unknown>) => {
    if (method === 'settings/describe')
      return { namespaces: [{ ns: 'botharness-client', revision, value: current }] };
    if (refuse || args['expectedRevision'] !== revision) throw new Error('stale');
    revision += 1;
    current = { ...current, ...(args['patch'] as object) };
    return { ns: 'botharness-client', revision, value: current };
  });
  return { call };
}

async function render() {
  view = document.createElement('div');
  document.body.append(view);
  root = createRoot(view);
  await act(async () => root!.render(<SessionRequestsSetting />));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  return () =>
    view!.querySelector<HTMLButtonElement>(`[aria-label="${t.hostSessions.requests.title}"]`);
}

it('shows the Host setting on by default and writes it at the read revision', async () => {
  const fake = host({ sortMode: 'recent' });
  session.saved = { hostId: 'studio' };
  session.client = fake;
  const toggle = await render();
  expect(toggle()?.getAttribute('aria-checked')).toBe('true');
  expect(view!.querySelector('section')?.getAttribute('data-footer')).toBe(
    t.hostSessions.requests.footer,
  );
  await act(async () => toggle()!.click());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(fake.call).toHaveBeenCalledWith('settings/update', {
    ns: 'botharness-client',
    patch: { nativeSessionAttention: false },
    expectedRevision: 4,
  });
  expect(toggle()?.getAttribute('aria-checked')).toBe('false');
  expect(session.inbox.refresh).toHaveBeenCalledOnce();
  await act(async () => toggle()!.click());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(fake.call).toHaveBeenLastCalledWith('settings/update', {
    ns: 'botharness-client',
    patch: { nativeSessionAttention: true },
    expectedRevision: 5,
  });
});

it('puts the switch back and says so when the Host refuses the change', async () => {
  const fake = host({ nativeSessionAttention: false }, true);
  session.saved = { hostId: 'studio' };
  session.client = fake;
  const toggle = await render();
  expect(toggle()?.getAttribute('aria-checked')).toBe('false');
  await act(async () => toggle()!.click());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(toggle()?.getAttribute('aria-checked')).toBe('false');
  expect(toggle()?.getAttribute('data-detail')).toBe(t.hostSessions.requests.failed);
});

it('is not offered to a team member', async () => {
  session.saved = { hostId: 'studio', member: { humanId: 'h1' } };
  session.client = host({});
  const toggle = await render();
  expect(toggle()).toBeNull();
});
