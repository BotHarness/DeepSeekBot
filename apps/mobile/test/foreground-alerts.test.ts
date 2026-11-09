import { describe, expect, it } from 'vitest';
import { alertFromPush, createAlertBanners } from '../src/host/alert-banners';

const push = {
  v: 1,
  hostId: 'studio',
  itemId: 'reply:1',
  kind: 'channel-reply',
  botSlug: 'helper',
  channelId: 'dm-helper',
  messageId: 'm1',
  sender: 'Helper',
  text: 'Done',
};

describe('pushes that arrive while the app is open', () => {
  it('become in-app banners carrying the routing payload', () => {
    expect(alertFromPush('Helper', 'Done', push)).toEqual({
      title: 'Helper',
      body: 'Done',
      data: { ...push },
    });
  });

  it('read the title and message an Android data-only push carries in its data', () => {
    const alert = alertFromPush(null, null, { ...push, title: '#ops', message: 'Shipped' });
    expect(alert).toMatchObject({ title: '#ops', body: 'Shipped' });
  });

  it('leave test, pairing and badge-only pushes to the system', () => {
    expect(alertFromPush('Test', 'Hi', { v: 1, hostId: 'studio', test: true })).toBeUndefined();
    expect(
      alertFromPush('New device', 'Paired', {
        v: 1,
        hostId: 'studio',
        kind: 'device-paired',
        deviceId: 'd1',
      }),
    ).toBeUndefined();
    expect(alertFromPush(null, null, { v: 1, hostId: 'studio' })).toBeUndefined();
    expect(alertFromPush('x', 'y', undefined)).toBeUndefined();
  });

  it('queue once per item and stay silent while in-app alerts are off', () => {
    const banners = createAlertBanners();
    const alert = alertFromPush('Helper', 'Done', push)!;
    banners.present(alert);
    banners.present({ ...alert, body: 'Done again' });
    expect(banners.getSnapshot()?.body).toBe('Done again');
    banners.dismiss();
    expect(banners.getSnapshot()).toBeUndefined();
    banners.setEnabled(false);
    banners.present(alert);
    expect(banners.getSnapshot()).toBeUndefined();
  });
});
