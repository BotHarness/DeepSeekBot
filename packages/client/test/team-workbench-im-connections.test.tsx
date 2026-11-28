// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MessagingConnection } from '@botharness/host-protocol/messaging-connections';
import { fakeTeamMode } from '../../host-client/test/reader-fixtures.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { channelSettings } from '../src/client/channel-settings-state.js';
import { zhTranslate } from '../src/client/locale.js';
import { connectionStatus } from '../src/client/team-workbench/im-connection-model.js';
import {
  BOT_IM_SETTINGS_ENTRY,
  ImConnectionsSection,
} from '../src/client/team-workbench/im-connections-section.js';
import { visibleSections } from '../src/client/team-workbench/sections.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  channelSettings.close();
});

function connection(overrides: Partial<MessagingConnection> = {}): MessagingConnection {
  return {
    id: 'support-lark',
    botSlug: 'support',
    botName: '客服助手',
    canOpenSettings: true,
    providerId: 'lark',
    platform: 'feishu',
    accountRef: 'cli_support',
    name: '客服飞书',
    enabled: true,
    availability: 'available',
    reception: 'receiving',
    ...overrides,
  };
}

const saved = [
  connection(),
  connection({
    id: 'sales-slack',
    botSlug: 'sales',
    botName: '销售助手',
    providerId: 'slack',
    platform: 'slack',
    accountRef: 'T1',
    name: '销售 Slack',
    reception: 'off',
  }),
];

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await act(async () => Promise.resolve());
}

function statuses(): Record<string, string | undefined> {
  return Object.fromEntries(
    [...host.querySelectorAll<HTMLElement>('[data-im-connection]')].map((node) => [
      node.dataset['imConnection'],
      node.dataset['imStatus'],
    ]),
  );
}

it('shows IM connections only to the Host Owner of a workbench that can open them', () => {
  const owner = { ...fakeTeamMode(), enabled: true } as never;
  const member = {
    ...fakeTeamMode({ kind: 'member', humanId: 'ann', permissions: ['roles.manage'] }),
    enabled: true,
  } as never;
  const ids = (view: never, imConnections: boolean) =>
    visibleSections({ view, roles: [], members: [], imConnections }).map((section) => section.id);
  expect(ids(owner, true)).toContain('imConnections');
  expect(ids(member, true)).not.toContain('imConnections');
  expect(ids(owner, false)).not.toContain('imConnections');
});

it('reads one status for each connection, with unchecked accounts while checks are pending', () => {
  expect(connectionStatus(connection(), 'pending').label).toBe('im.checking');
  expect(connectionStatus(connection({ enabled: false }), 'pending').label).toBe(
    'identity.state.paused',
  );
  expect(connectionStatus(connection(), 'complete')).toEqual({
    label: 'reception.receiving',
    tone: 'success',
  });
  expect(
    connectionStatus(
      connection({ availability: 'unavailable', reception: 'unavailable' }),
      'complete',
    ).tone,
  ).toBe('danger');
  expect(
    connectionStatus(
      connection({
        reception: 'connecting',
        recovery: {
          kind: 'retrying',
          reason: 'provider-unavailable',
          attempt: 1,
          nextRetryAt: '2026-11-28T00:00:00.000Z',
        },
      }),
      'complete',
    ).label,
  ).toBe('reception.retrying');
});

it('lists saved connections by Bot, then refreshes their status and opens Bot settings', async () => {
  const modes: unknown[] = [];
  const call = vi.fn<BridgeCall>(async (method, args) => {
    if (method !== 'messagingConnections') throw new Error(`Unexpected ${method}`);
    const mode = (args as { mode?: string }).mode;
    modes.push(mode);
    return mode === 'saved'
      ? { ok: true, value: { checks: 'pending', bindings: saved } }
      : {
          ok: true,
          value: {
            checks: 'complete',
            bindings: [
              saved[0],
              { ...saved[1], availability: 'unavailable', reception: 'unavailable' },
            ],
          },
        };
  });
  const openBot = vi.fn(async () => undefined);
  await act(async () =>
    root.render(
      <ImConnectionsSection call={call} t={zhTranslate} actions={{ openBot } as never} />,
    ),
  );
  await settle();

  expect(modes).toEqual(['saved', 'status']);
  expect(
    [...host.querySelectorAll<HTMLElement>('[data-im-connection-bot]')].map(
      (node) => node.dataset['imConnectionBot'],
    ),
  ).toEqual(['support', 'sales']);
  expect(statuses()).toEqual({
    'support-lark': 'reception.receiving',
    'sales-slack': 'identity.state.unavailable',
  });

  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-im-connection="sales-slack"]')!.click(),
  );
  expect(host.querySelector('[data-im-connection-detail="sales-slack"]')).not.toBeNull();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-im-connection-settings]')!.click(),
  );
  expect(openBot).toHaveBeenCalledWith('sales');
  expect(channelSettings.getSnapshot()).toEqual({ open: true, sectionId: BOT_IM_SETTINGS_ENTRY });
});

it('keeps the saved list when the status check fails and hides settings it cannot open', async () => {
  const call = vi.fn<BridgeCall>(async (_method, args) =>
    (args as { mode?: string }).mode === 'saved'
      ? {
          ok: true,
          value: { checks: 'pending', bindings: [connection({ canOpenSettings: false })] },
        }
      : { ok: false, error: { code: 'provider-unavailable', message: 'offline', details: {} } },
  );
  await act(async () =>
    root.render(
      <ImConnectionsSection call={call} t={zhTranslate} actions={{ openBot: vi.fn() } as never} />,
    ),
  );
  await settle();

  expect(statuses()).toEqual({ 'support-lark': 'im.checking' });
  expect(host.textContent).toContain(zhTranslate('team.imConnections.statusFailed'));
  expect(host.querySelector('[data-im-connection-settings]')).toBeNull();
});
