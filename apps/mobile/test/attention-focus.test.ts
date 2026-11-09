import { describe, expect, it } from 'vitest';
import { createAlertBanners } from '../src/host/alert-banners';
import { createAttentionFocus, dmChannel } from '../src/host/attention-focus';
import { createDeviceAlerts, type AlertSnapshot } from '../src/host/device-alerts';

const reply = (channelId: string, kind = 'channel-reply') => ({
  hostId: 'studio',
  channelId,
  kind,
});

describe('attention focus', () => {
  it('covers replies only in held channels on the same Host, until released', () => {
    const focus = createAttentionFocus();
    let changes = 0;
    focus.subscribe(() => changes++);
    expect(focus.covers(reply('dm-helper'))).toBe(false);
    const release = focus.hold({ hostId: 'studio', channelId: dmChannel('helper') });
    expect(focus.covers(reply('dm-helper'))).toBe(true);
    expect(focus.covers(reply('dm-helper', 'channel-mention'))).toBe(true);
    expect(focus.covers({ ...reply('dm-helper'), hostId: 'other' })).toBe(false);
    expect(focus.covers(reply('dm-writer'))).toBe(false);
    release();
    release();
    expect(focus.covers(reply('dm-helper'))).toBe(false);
    expect(changes).toBe(2);
  });

  it('keeps alerting for requests and malformed push data in a held channel', () => {
    const focus = createAttentionFocus();
    focus.hold({ hostId: 'studio', channelId: 'dm-helper' });
    expect(focus.covers(reply('dm-helper', 'tool-approval'))).toBe(false);
    expect(focus.covers(reply('dm-helper', 'user-question'))).toBe(false);
    expect(focus.covers({ hostId: 'studio', kind: 'channel-reply' })).toBe(false);
    expect(focus.covers(undefined)).toBe(false);
    expect(focus.covers(null)).toBe(false);
  });

  it('keeps a channel held while any holder (chat page or call) still holds it', () => {
    const focus = createAttentionFocus();
    const page = focus.hold({ hostId: 'studio', channelId: 'dm-helper' });
    const call = focus.hold({ hostId: 'studio', channelId: 'dm-helper' });
    expect(focus.channels('studio')).toEqual(['dm-helper']);
    page();
    expect(focus.covers(reply('dm-helper'))).toBe(true);
    call();
    expect(focus.channels('studio')).toEqual([]);
  });

  it('silences a live call DM in local alerts even while the app is in the background', async () => {
    const snapshots: AlertSnapshot[] = [];
    const owner = createDeviceAlerts({
      reconcile: async (snapshot) => {
        snapshots.push(snapshot);
      },
      forget: async () => {},
    });
    const base = {
      hostId: 'studio',
      connected: true,
      foreground: false,
      approvalsEnabled: true,
      preferences: { approval: true, question: true, 'private-input': true, reply: true },
      botName: () => 'Helper',
      approvalText: 'Approval',
      items: [],
    };
    const item = (id: string, kind: string, channelId: string) => ({
      id,
      kind,
      category: 'action' as const,
      botSlug: 'helper',
      channelId,
      messageId: `m-${id}`,
      summary: id,
      createdAt: '2026-11-09T00:00:00.000Z',
    });
    await owner.update(base);
    await owner.update({
      ...base,
      focusedChannelIds: ['dm-helper'],
      items: [
        item('call-reply', 'channel-reply', 'dm-helper'),
        item('group-reply', 'channel-reply', 'ops'),
        item('approval', 'tool-approval', 'dm-helper'),
      ],
    });
    expect(snapshots.at(-1)?.silent).toEqual(['call-reply']);
    expect(snapshots.at(-1)?.alerts.map((alert) => alert.data.itemId)).toEqual([
      'group-reply',
      'approval',
    ]);
  });

  it('drops queued in-app banners once their chat comes into focus', () => {
    const focus = createAttentionFocus();
    const banners = createAlertBanners();
    const alert = (itemId: string, channelId: string, kind = 'channel-reply') => ({
      title: 'Helper',
      body: itemId,
      data: {
        v: 1 as const,
        hostId: 'studio',
        itemId,
        kind,
        botSlug: 'helper',
        channelId,
        messageId: itemId,
        sender: 'Helper',
        text: itemId,
      },
    });
    banners.reconcile(
      'studio',
      ['a', 'b', 'c'],
      [alert('a', 'dm-helper'), alert('b', 'ops'), alert('c', 'dm-helper', 'user-question')],
    );
    focus.hold({ hostId: 'studio', channelId: 'dm-helper' });
    banners.discard((entry) => focus.covers(entry.data));
    const left: string[] = [];
    while (banners.getSnapshot()) {
      left.push(banners.getSnapshot()!.data.itemId);
      banners.dismiss();
    }
    expect(left).toEqual(['b', 'c']);
  });
});
