import { describe, expect, it } from 'vitest';
import {
  createDeviceAlerts,
  type AlertSnapshot,
  type DeviceAlertInput,
} from '../src/host/device-alerts';
import { createAlertBanners } from '../src/host/alert-banners';

const input: DeviceAlertInput = {
  hostId: 'studio',
  connected: true,
  foreground: true,
  approvalsEnabled: true,
  preferences: { approval: true, question: true, 'private-input': true, reply: true },
  quietChannelIds: [],
  botName: () => 'Helper',
  approvalText: 'Approval',
  text: {
    approval: 'Approval',
    question: 'Question',
    'private-input': 'Private input',
    reply: 'Reply',
  },
  items: [],
};
const item = (kind: string, id = kind) => ({
  id,
  kind,
  category: 'action' as const,
  botSlug: 'helper',
  createdAt: '2026-11-03T00:00:00Z',
  channelId: 'dm:helper',
  messageId: id,
  summary: 'Never expose private request text',
});
function fixture() {
  const snapshots: AlertSnapshot[] = [];
  const owner = createDeviceAlerts({
    reconcile: async (snapshot) => {
      snapshots.push(snapshot);
    },
    forget: async () => {},
  });
  return { owner, snapshots };
}

describe('device alert presentation', () => {
  it('routes every existing kind from a complete feed without a token and removes private input text', async () => {
    const { owner, snapshots } = fixture();
    await owner.update(input);
    const kinds = [
      'tool-approval',
      'workspace-grant-request',
      'auto-rejection',
      'group-join-request',
      'user-question',
      'assignment-waiting-human',
      'assignment-blocked',
      'private-input',
      'channel-reply',
      'channel-mention',
    ];
    await owner.update({ ...input, items: kinds.map((kind) => item(kind)) });
    expect(snapshots.at(-1)?.alerts.map((alert) => alert.data.kind)).toEqual(kinds);
    const secret = snapshots.at(-1)?.alerts.find((alert) => alert.data.kind === 'private-input');
    expect(secret?.body).toBe('Private input');
    expect(JSON.stringify(secret)).not.toContain('Never expose');
  });

  it('baselines old replies and silently consumes current-conversation replies but keeps requests visible', async () => {
    const { owner, snapshots } = fixture();
    await owner.update({ ...input, items: [item('channel-reply', 'old')] });
    expect(snapshots.at(-1)?.silent).toEqual(['old']);
    await owner.update({
      ...input,
      visibleChannelId: 'dm:helper',
      items: [item('channel-reply', 'new'), item('user-question')],
    });
    expect(snapshots.at(-1)?.silent).toEqual(['new']);
    expect(snapshots.at(-1)?.alerts.map((alert) => alert.data.kind)).toEqual(['user-question']);
    await owner.update({ ...input, items: [item('channel-reply', 'other')] });
    expect(snapshots.at(-1)?.alerts.map((alert) => alert.data.itemId)).toEqual(['other']);
  });

  it('honors kind opt-out and muted channels while retaining pending identities for resolution', async () => {
    const { owner, snapshots } = fixture();
    await owner.update({
      ...input,
      preferences: { ...input.preferences!, question: false },
      items: [item('user-question')],
    });
    expect(snapshots.at(-1)?.alerts).toEqual([]);
    expect(snapshots.at(-1)?.pending).toEqual(['user-question']);
    await owner.update({
      ...input,
      quietChannelIds: ['dm:helper'],
      items: [item('channel-reply'), item('tool-approval')],
    });
    expect(snapshots.at(-1)?.alerts.map((alert) => alert.data.kind)).toEqual(['tool-approval']);
  });

  it('removes resolved banners and opens the original trusted routing payload once', async () => {
    const { owner, snapshots } = fixture();
    await owner.update({ ...input, items: [item('user-question')] });
    const banners = createAlertBanners();
    const opened: unknown[] = [];
    banners.onOpen((data) => opened.push(data));
    banners.reconcile('studio', ['user-question'], snapshots[0]!.alerts);
    banners.reconcile('studio', ['user-question'], snapshots[0]!.alerts);
    banners.open();
    banners.open();
    expect(opened).toEqual([snapshots[0]!.alerts[0]!.data]);
    banners.reconcile('studio', ['user-question'], snapshots[0]!.alerts);
    banners.reconcile('studio', [], []);
    expect(banners.getSnapshot()).toBeUndefined();
  });
});
