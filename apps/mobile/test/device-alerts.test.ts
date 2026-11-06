import { describe, expect, it } from 'vitest';

import { createDeviceAlerts, type AlertSnapshot } from '../src/host/device-alerts';
import type { HumanAttentionItem } from '../src/host/wire';

const approval: HumanAttentionItem = {
  id: 'approval-1',
  kind: 'tool-approval',
  category: 'action',
  createdAt: '2026-11-03T00:00:00Z',
  botSlug: 'helper',
  channelId: 'dm:helper',
  messageId: 'message-1',
  summary: 'Run a command',
};

describe('device approval alerts', () => {
  it('preserves Host-level opt-out and never rearms a forgotten Host through policy sync', async () => {
    const policies: unknown[] = [];
    const alerts = createDeviceAlerts({
      reconcile: async () => {},
      forget: async () => {},
      syncHosts: async (hosts, enabled, muted) => {
        policies.push({ hosts, enabled, muted });
      },
    });
    alerts.setHostEnabled('studio', false);
    expect(alerts.hostEnabled('studio')).toBe(false);
    await alerts.syncHosts(['studio'], true);
    const removing = alerts.forget('studio');
    await alerts.syncHosts(['studio'], true);
    await removing;
    expect(policies).toEqual([
      { hosts: ['studio'], enabled: true, muted: { studio: false } },
      { hosts: [], enabled: true, muted: {} },
    ]);
  });
  it('coalesces unchanged projections and prevents an in-flight feed from rearming an unpaired Host', async () => {
    const snapshots: AlertSnapshot[] = [];
    const forgotten: string[] = [];
    const alerts = createDeviceAlerts({
      reconcile: async (snapshot) => {
        snapshots.push(snapshot);
      },
      forget: async (host) => {
        forgotten.push(host);
      },
    });
    const input = {
      hostId: 'studio',
      connected: true,
      items: [approval],
      foreground: false,
      approvalsEnabled: true,
      botName: () => 'Helper',
      approvalText: 'Needs your approval',
    };
    await alerts.update(input);
    await alerts.update(input);
    expect(snapshots).toHaveLength(1);
    const removing = alerts.forget('studio');
    await alerts.update(input);
    await removing;
    expect(snapshots).toHaveLength(1);
    expect(forgotten).toEqual(['studio']);
  });
  it('never resolves alerts using a disconnected or incomplete feed', async () => {
    const snapshots: AlertSnapshot[] = [];
    const alerts = createDeviceAlerts({
      reconcile: async (snapshot) => {
        snapshots.push(snapshot);
      },
      forget: async () => {},
    });
    const input = {
      hostId: 'studio',
      connected: true,
      items: undefined,
      foreground: false,
      approvalsEnabled: true,
      botName: () => 'Helper',
      approvalText: 'Needs your approval',
    };
    await alerts.update(input);
    await alerts.update({ ...input, connected: false, items: [] });
    expect(snapshots).toEqual([]);
  });

  it.each([
    { foreground: true, approvalsEnabled: true },
    { foreground: false, approvalsEnabled: false },
  ])('still reconciles resolution without a local alert for %j', async (policy) => {
    const snapshots: AlertSnapshot[] = [];
    const alerts = createDeviceAlerts({
      reconcile: async (snapshot) => {
        snapshots.push(snapshot);
      },
      forget: async () => {},
    });
    await alerts.update({
      hostId: 'studio',
      connected: true,
      items: [approval],
      ...policy,
      botName: () => 'Helper',
      approvalText: 'Needs your approval',
    });
    expect(snapshots).toEqual([{ hostId: 'studio', pending: ['approval-1'], alerts: [] }]);
  });

  it('submits a background approval without depending on a cloud push token', async () => {
    const snapshots: AlertSnapshot[] = [];
    const alerts = createDeviceAlerts({
      reconcile: async (snapshot) => {
        snapshots.push(snapshot);
      },
      forget: async () => {},
    });
    await alerts.update({
      hostId: 'studio',
      connected: true,
      items: [approval],
      foreground: false,
      approvalsEnabled: true,
      botName: () => 'Helper',
      approvalText: 'Needs your approval',
    });
    expect(snapshots).toEqual([
      {
        hostId: 'studio',
        pending: ['approval-1'],
        alerts: [
          {
            title: 'Helper',
            body: 'Needs your approval',
            data: {
              v: 1,
              hostId: 'studio',
              itemId: 'approval-1',
              kind: 'tool-approval',
              botSlug: 'helper',
              channelId: 'dm:helper',
              messageId: 'message-1',
              sender: 'Helper',
              text: 'Needs your approval',
            },
          },
        ],
      },
    ]);
  });
});
