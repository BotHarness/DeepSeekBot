import { it, expect } from 'vitest';
import { createAlertBanners } from '../src/host/alert-banners';
import { parsePushData, pushHref } from '../src/host/push';
import type { LocalApprovalAlert } from '../src/host/device-alerts';

const summary: LocalApprovalAlert = {
  title: 'Studio',
  body: 'New replies 2 · Needs you 1',
  members: ['a', 'b', 'c'],
  data: {
    v: 1,
    hostId: 'studio',
    itemId: 'recovery:batch',
    kind: 'recovery-summary',
    botSlug: '',
    channelId: '',
    messageId: '',
    sender: 'Studio',
    text: 'New replies 2 · Needs you 1',
  },
};

it('opens recovery into the original Host Activity rather than a synthetic Inbox item', () => {
  const target = parsePushData(summary.data);
  expect(target).toMatchObject({ hostId: 'studio', kind: 'recovery-summary' });
  expect(pushHref(target!, () => undefined)).toEqual({ pathname: '/activity' });
});

it('updates an existing summary in place, retains pending members and respects dismissal', () => {
  const banners = createAlertBanners();
  banners.reconcile('studio', ['a', 'b', 'c'], [summary]);
  expect(banners.getSnapshot()).toEqual(summary);
  const updated = { ...summary, members: ['b'], body: 'New replies 0 · Needs you 1' };
  banners.reconcile('studio', ['b'], [updated]);
  expect(banners.getSnapshot()).toEqual(updated);
  banners.dismiss();
  banners.reconcile('studio', ['b'], [updated]);
  expect(banners.getSnapshot()).toBeUndefined();
});

it('removes a summary only when all its members disappear and keeps Hosts separate', () => {
  const banners = createAlertBanners();
  const laptop = { ...summary, data: { ...summary.data, hostId: 'laptop' } };
  banners.reconcile('studio', ['a'], [summary]);
  banners.reconcile('laptop', ['a'], [laptop]);
  banners.reconcile('studio', [], []);
  expect(banners.getSnapshot()).toEqual(laptop);
});
