// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  filter: 'all',
  hosts: [
    { hostId: 'a', hostName: 'Studio' },
    { hostId: 'b', hostName: 'Laptop' },
  ],
  saved: { hostId: 'a', hostName: 'Studio' } as { hostId: string; hostName: string } | null,
}));

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({ hosts: state.hosts, saved: state.saved }),
}));
vi.mock('../src/host/native-conversation-filter', () => ({
  useConversationFilter: () => [state.filter],
}));
vi.mock('../src/host/native-host-look', () => ({ useHostLook: () => ({}) }));
vi.mock('../src/cloud/native', () => ({ useCloudSnapshot: () => ({ rows: [] }) }));
vi.mock('../src/cloud/native-conversations', () => ({
  useCloudConversations: () => ({ workspaces: [] }),
}));
vi.mock('../src/ui/chat/sheet', () => ({ SHEET_GROUP: 'raised' }));
vi.mock('../src/ui/primitives/settings-row', () => ({
  SettingsRow: ({ title, control }: { title: string; control: { text: string } }) =>
    createElement('p', null, `${title}: ${control.text}`),
}));

const { EnvironmentSettingsRow, useEnvironmentFooter } =
  await import('../src/ui/shell/environment-settings-row');
const { t } = await import('../src/ui/strings');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => act(() => root?.unmount()));

function Probe() {
  return createElement(
    'div',
    null,
    createElement(EnvironmentSettingsRow),
    createElement('footer', null, useEnvironmentFooter()),
  );
}

async function render() {
  const host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root!.render(createElement(Probe)));
  return host;
}

it.each([
  ['all', t.environmentSheet.allRecent('Studio'), t.environmentSheet.savedOnRecent('Studio')],
  [JSON.stringify(['computer', 'a']), 'Studio', t.environmentSheet.savedOn('Studio')],
  ['["cloud-scope","org"]', t.allEnvironmentsRow, t.environmentSheet.savedOnCurrent('Studio')],
])(
  'names the Computer behind the Environment settings for filter %s',
  async (filter, row, footer) => {
    state.filter = filter;
    const view = await render();
    expect(view.querySelector('p')!.textContent).toBe(`${t.environmentSheet.title}: ${row}`);
    expect(view.querySelector('footer')!.textContent).toBe(footer);
  },
);
