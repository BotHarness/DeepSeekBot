import { describe, expect, it, vi } from 'vitest';

import { createDeviceAlerts, type AlertSnapshot } from '../src/host/device-alerts';
import { createInAppBanners } from '../src/host/in-app-banners';
import type { HumanAttentionItem } from '../src/host/wire';

const PREFERENCES = { approval: true, question: true, 'private-input': true, reply: true };

const approval = (id: string): HumanAttentionItem => ({
  id,
  kind: 'tool-approval',
  category: 'action',
  createdAt: '2026-11-03T00:00:00Z',
  botSlug: 'helper',
  channelId: 'dm-helper',
  messageId: `message-${id}`,
  summary: 'Run a command',
});

function fixture() {
  const snapshots: AlertSnapshot[] = [];
  const alerts = createDeviceAlerts({
    reconcile: async (snapshot) => {
      snapshots.push(snapshot);
    },
    forget: async () => {},
  });
  const update = (items: HumanAttentionItem[], foreground: boolean, inAppOnly = true) =>
    alerts.update({
      hostId: 'studio',
      connected: true,
      items,
      foreground,
      approvalsEnabled: true,
      preferences: PREFERENCES,
      inAppOnly,
      botName: () => 'Helper',
      approvalText: 'Needs your approval',
    });
  return { snapshots, update };
}

describe('in-app-only delivery', () => {
  it('keeps alerts out of the background and marks the snapshot in-app', async () => {
    const f = fixture();
    await f.update([approval('a1')], false);
    expect(f.snapshots.at(-1)).toMatchObject({ inApp: true, pending: ['a1'], alerts: [] });
    await f.update([approval('a1')], true);
    expect(f.snapshots.at(-1)?.alerts.map((alert) => alert.data.itemId)).toEqual(['a1']);
    await f.update([approval('a1')], false, false);
    expect(f.snapshots.at(-1)?.inApp).toBeUndefined();
    expect(f.snapshots.at(-1)?.alerts.map((alert) => alert.data.itemId)).toEqual(['a1']);
  });

  it('shows a banner only for items that arrive while the app is open', async () => {
    const f = fixture();
    const present = vi.fn();
    const banners = createInAppBanners(present);
    await f.update([approval('a1')], false);
    banners.reconcile(f.snapshots.at(-1)!, false);
    await f.update([approval('a1')], true);
    banners.reconcile(f.snapshots.at(-1)!, true);
    expect(present.mock.calls.at(-1)).toEqual(['studio', ['a1'], []]);
    await f.update([approval('a1'), approval('a2')], true);
    banners.reconcile(f.snapshots.at(-1)!, true);
    const [, pending, added] = present.mock.calls.at(-1)!;
    expect(pending).toEqual(['a1', 'a2']);
    expect(added.map((alert: { data: { itemId: string } }) => alert.data.itemId)).toEqual(['a2']);
    await f.update([approval('a1'), approval('a2')], true, false);
    const calls = present.mock.calls.length;
    banners.reconcile(f.snapshots.at(-1)!, true);
    expect(present.mock.calls.length).toBe(calls);
  });
});
