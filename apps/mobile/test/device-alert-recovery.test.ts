import { describe, expect, it, vi } from 'vitest';
import {
  createDeviceAlerts,
  type AlertSnapshot,
  type DeviceAlertInput,
} from '../src/host/device-alerts';

const preferences = { approval: true, question: true, 'private-input': true, reply: true };
const input: DeviceAlertInput = {
  hostId: 'studio',
  hostName: 'Studio',
  language: 'en',
  connected: true,
  foreground: false,
  approvalsEnabled: true,
  preferences,
  botName: () => 'Helper',
  approvalText: 'Needs you',
  items: [
    {
      id: 'reply-1',
      kind: 'channel-reply',
      category: 'replies',
      botSlug: 'helper',
      channelId: 'dm:helper',
      createdAt: '2026-11-03T00:00:00Z',
      summary: 'Hello',
    },
  ],
};

function setup() {
  const snapshots: AlertSnapshot[] = [];
  const owner = createDeviceAlerts({
    recoverySession: 'process-1',
    reconcile: async (snapshot) => {
      snapshots.push(snapshot);
    },
    forget: async () => {},
  });
  return { owner, snapshots };
}

describe('durable recovery handoff', () => {
  it('hands initial replies to the durable owner instead of a process-local baseline', async () => {
    const { owner, snapshots } = setup();
    await owner.update(input);
    expect(snapshots[0]).toMatchObject({
      recovery: {
        session: 'process-1',
        ready: true,
        enabled: true,
        hostName: 'Studio',
        language: 'en',
      },
      silent: [],
      alerts: [{ data: { itemId: 'reply-1' } }],
    });
    await owner.update(input);
    expect(snapshots).toHaveLength(1);
  });

  it('reports loss and incomplete reconnect without presenting either as an authoritative empty set', async () => {
    const { owner, snapshots } = setup();
    await owner.update(input);
    await owner.update({ ...input, connected: false });
    await owner.update({ ...input, items: undefined });
    await owner.update(input);
    expect(snapshots.map((snapshot) => snapshot.recovery?.ready)).toEqual([true, false, true]);
    expect(snapshots[1]).toMatchObject({ pending: [], alerts: [], recovery: { ready: false } });
    expect(snapshots[2]?.pending).toEqual(['reply-1']);
  });

  it('preserves explicit disable and visible-conversation suppression across recovery', async () => {
    const { owner, snapshots } = setup();
    await owner.update({ ...input, approvalsEnabled: false });
    await owner.update({ ...input, foreground: true, visibleChannelId: 'dm:helper' });
    expect(snapshots[0]?.recovery?.enabled).toBe(false);
    expect(snapshots[1]).toMatchObject({
      alerts: [],
      silent: ['reply-1'],
      recovery: { enabled: true },
    });
  });

  it('does not mistake an unread Host preference for an explicit disable', async () => {
    const { owner, snapshots } = setup();
    await owner.update({ ...input, approvalsEnabled: false, policyReady: false });
    expect(snapshots[0]?.recovery).toMatchObject({ ready: false });
    expect(snapshots[0]?.recovery?.enabled).toBeUndefined();
    await owner.update({ ...input, policyReady: true });
    expect(snapshots[1]?.recovery).toMatchObject({ ready: true, enabled: true });
  });

  it('assigns a single recovery batch to Hosts in one complete refresh', async () => {
    const snapshots: AlertSnapshot[] = [];
    const owner = createDeviceAlerts(
      {
        recoverySession: 'process-1',
        reconcile: async (snapshot) => {
          snapshots.push(snapshot);
        },
        forget: async () => {},
      },
      {
        ready: Promise.resolve(),
        failed: () => {
          throw Error('unexpected refresh failure');
        },
        read: () => ({
          approvalsEnabled: true,
          preferences,
          hosts: [input, { ...input, hostId: 'laptop' }],
        }),
      },
    );
    owner.setHostEnabled('studio', true);
    owner.setHostEnabled('laptop', true);
    owner.refresh();
    await vi.waitFor(() => expect(snapshots).toHaveLength(2));
    expect(snapshots[0]?.recovery?.batch).toBe(snapshots[1]?.recovery?.batch);
    expect(snapshots.map((snapshot) => snapshot.hostId)).toEqual(['studio', 'laptop']);
  });
});
