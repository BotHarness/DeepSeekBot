// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  scope: 'all',
  hosts: [] as {
    saved: { hostId: string; hostName: string; deviceId: string; routes: []; credential: string };
    client: object;
    snapshot: { connection: { status: string } };
  }[],
  panel: vi.fn(),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({ saved: fixture.hosts[0]?.saved }),
  useHostSessions: () => fixture.hosts,
}));
vi.mock('../src/host/native-conversation-filter', () => ({
  useConversationFilter: () => [fixture.scope, () => {}],
}));
vi.mock('../src/host/native-host-look', () => ({
  useHostLocalNames: (ids: readonly string[]) => ids.map(() => ''),
}));
vi.mock('../src/features/sessions/session-drawer-panel', () => ({
  SessionDrawerPanel: (props: { title: string; hosts: { hostId: string }[] }) => {
    fixture.panel(props);
    return <span data-testid="panel">{props.title}</span>;
  },
}));
vi.mock('../src/features/sessions/session-drawer-navigation', () => ({
  openDrawerSession: vi.fn(),
  openNewSession: vi.fn(),
}));
vi.mock('../src/features/sessions/session-drawer-state', () => ({
  useDrawerPlace: () => ({ edge: 0, sessionId: undefined }),
}));

import { SessionDrawerContent } from '../src/features/sessions/session-drawer-content';
import { interfacePreferences } from '../src/ui/interface-preferences';

interfacePreferences.setSystemLocales(['en']);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const host = (hostId: string, status = 'connected') => ({
  saved: { hostId, hostName: hostId, deviceId: `${hostId}-d`, routes: [] as [], credential: 'c' },
  client: {},
  snapshot: { connection: { status } },
});

let view: HTMLElement;
let root: ReturnType<typeof createRoot>;
async function render() {
  await act(async () => root.render(<SessionDrawerContent active />));
  return view;
}
afterEach(() => {
  act(() => root?.unmount());
  fixture.panel.mockClear();
});
function mount() {
  view = document.createElement('div');
  root = createRoot(view);
}

it('lists only connected Computers under All and says so when none is connected', async () => {
  mount();
  fixture.scope = 'all';
  fixture.hosts = [host('studio'), host('laptop', 'offline')];
  await render();
  expect(fixture.panel.mock.lastCall?.[0].hosts.map((h: { hostId: string }) => h.hostId)).toEqual([
    'studio',
  ]);
  fixture.hosts = [host('laptop', 'offline')];
  await render();
  expect(view.querySelector('[data-testid="session-drawer-notice"]')?.textContent).toContain(
    'Connect to a Host to see its sessions.',
  );
});

it('lists no Computer under a cloud scope instead of falling back to All', async () => {
  mount();
  fixture.scope = JSON.stringify(['cloud', 'org-1']);
  fixture.hosts = [host('studio'), host('laptop')];
  await render();
  expect(fixture.panel).not.toHaveBeenCalled();
  expect(view.querySelector('[data-testid="session-drawer-notice"]')?.textContent).toContain(
    'Sessions run on a computer.',
  );
});

it('gives the panel new hosts when a Computer’s client is replaced', async () => {
  mount();
  fixture.scope = 'all';
  fixture.hosts = [host('studio')];
  await render();
  const first = fixture.panel.mock.lastCall?.[0].hosts;
  fixture.hosts = [{ ...host('studio'), client: {} }];
  await render();
  expect(fixture.panel.mock.lastCall?.[0].hosts).not.toBe(first);
});

it('keeps the same panel when a Computer under All goes offline', async () => {
  mount();
  fixture.scope = 'all';
  fixture.hosts = [host('studio'), host('laptop')];
  await render();
  const first = view.querySelector('[data-testid="panel"]');
  fixture.hosts = [host('studio'), host('laptop', 'offline')];
  await render();
  expect(view.querySelector('[data-testid="panel"]')).toBe(first);
  expect(fixture.panel.mock.lastCall?.[0].hosts.map((h: { hostId: string }) => h.hostId)).toEqual([
    'studio',
  ]);
});
