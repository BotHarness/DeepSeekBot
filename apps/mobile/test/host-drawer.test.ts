import { describe, expect, it, vi } from 'vitest';

import type { ConnectionState, HostClient } from '../src/host/client';
import { createHostGlances, glanceHost, liveGlance } from '../src/host/host-glance';
import type { SavedHost } from '../src/host/hosts';
import type { InboxSnapshot } from '../src/host/inbox';
import type { HumanAttentionItem } from '../src/host/wire';
import {
  createHostDrawer,
  drawerWidth,
  hostDrawerRows,
  hostRowBadge,
  settleOpen,
} from '../src/ui/shell/host-drawer-model';
import { badgeCount } from '../src/ui/primitives/badge-count';

const host = (hostId: string, hostName: string): SavedHost => ({
  hostId,
  hostName,
  routes: [`https://${hostId}.example.ts.net`],
  deviceId: 'phone',
  credential: `credential-${hostId}`,
});

const studio = host('studio', 'Studio Mac');
const laptop = host('laptop', 'Laptop');
const tower = host('tower', 'Tower');

const items = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `item-${index}` }) as HumanAttentionItem);

const ready = (action: number): InboxSnapshot => ({
  status: 'ready',
  sections: { action: items(action), replies: [], unread: [], handled: [] },
});

const connection = (status: ConnectionState['status']) =>
  ({ status, route: 'https://studio.example.ts.net' }) as ConnectionState;

function answering(
  answer: (method: string, args?: Record<string, unknown>) => Promise<unknown>,
): HostClient {
  return {
    call: vi.fn((method: string, args?: Record<string, unknown>) => answer(method, args)),
  } as unknown as HostClient;
}

describe('Host drawer', () => {
  it('opens from the chip and closes from the backdrop, returning focus to the chip', () => {
    const drawer = createHostDrawer({
      switchTo: vi.fn(async () => true),
      pair: vi.fn(),
      notifications: vi.fn(),
    });
    const focus = vi.fn();
    drawer.setReturnFocus(focus);
    expect(drawer.getSnapshot()).toEqual({ open: false, shown: false });

    drawer.open();
    expect(drawer.getSnapshot()).toEqual({ open: true, shown: true });

    drawer.close();
    expect(drawer.getSnapshot()).toEqual({ open: false, shown: true });
    expect(focus).toHaveBeenCalledTimes(1);

    drawer.hidden();
    expect(drawer.getSnapshot()).toEqual({ open: false, shown: false });
  });

  it('shows the drawer while an edge swipe drags it in, and hides it again when the swipe is let go early', () => {
    const drawer = createHostDrawer({
      switchTo: vi.fn(async () => true),
      pair: vi.fn(),
      notifications: vi.fn(),
    });
    const focus = vi.fn();
    drawer.setReturnFocus(focus);

    drawer.reveal();
    expect(drawer.getSnapshot()).toEqual({ open: false, shown: true });

    drawer.close();
    drawer.hidden();
    expect(drawer.getSnapshot()).toEqual({ open: false, shown: false });
    expect(focus).not.toHaveBeenCalled();
  });

  it('keeps the drawer shown when it reopens before the closing slide ends', () => {
    const drawer = createHostDrawer({
      switchTo: vi.fn(async () => true),
      pair: vi.fn(),
      notifications: vi.fn(),
    });
    drawer.open();
    drawer.close();
    drawer.open();
    drawer.hidden();
    expect(drawer.getSnapshot()).toEqual({ open: true, shown: true });
  });

  it('switches to the chosen Host and closes', async () => {
    const switchTo = vi.fn(async () => true);
    const drawer = createHostDrawer({ switchTo, pair: vi.fn(), notifications: vi.fn() });
    drawer.open();

    await expect(drawer.select('laptop')).resolves.toBe(true);
    expect(switchTo).toHaveBeenCalledWith('laptop');
    expect(drawer.getSnapshot().open).toBe(false);
  });

  it('opens the pairing flow from "Pair a new computer" and closes', () => {
    const pair = vi.fn();
    const drawer = createHostDrawer({
      switchTo: vi.fn(async () => true),
      pair,
      notifications: vi.fn(),
    });
    drawer.open();

    drawer.pairNew();
    expect(pair).toHaveBeenCalledTimes(1);
    expect(drawer.getSnapshot().open).toBe(false);
  });

  it('opens notification settings from the footer and closes', () => {
    const notifications = vi.fn();
    const drawer = createHostDrawer({
      switchTo: vi.fn(async () => true),
      pair: vi.fn(),
      notifications,
    });
    drawer.open();

    drawer.openNotifications();
    expect(notifications).toHaveBeenCalledTimes(1);
    expect(drawer.getSnapshot().open).toBe(false);
  });

  it('settles a released drag by distance, or by a fling either way', () => {
    expect(settleOpen(0.6, 0)).toBe(true);
    expect(settleOpen(0.2, 0)).toBe(false);
    expect(settleOpen(0.1, 900)).toBe(true);
    expect(settleOpen(0.9, -900)).toBe(false);
  });

  it('covers about 85% of the screen', () => {
    expect(drawerWidth(390)).toBe(332);
    expect(drawerWidth(900)).toBe(360);
  });
});

describe('Host rows', () => {
  it('lists every Host in pairing order, marks the current one and keeps its live pending count with the glanced unread count', () => {
    const rows = hostDrawerRows(
      [studio, laptop, tower],
      'studio',
      {
        studio: { status: 'online', pending: 9, unread: 4 },
        laptop: { status: 'offline' },
        tower: { status: 'online', pending: 2, unread: 1 },
      },
      liveGlance(connection('connected'), ready(3)),
    );
    expect(rows).toEqual([
      {
        hostId: 'studio',
        hostName: 'Studio Mac',
        current: true,
        glance: { status: 'online', pending: 3, unread: 4 },
      },
      { hostId: 'laptop', hostName: 'Laptop', current: false, glance: { status: 'offline' } },
      {
        hostId: 'tower',
        hostName: 'Tower',
        current: false,
        glance: { status: 'online', pending: 2, unread: 1 },
      },
    ]);
  });

  it('shows what needs the Human before unread conversations, in one chip', () => {
    expect(hostRowBadge({ status: 'online', pending: 2, unread: 5 })).toEqual({
      tone: 'needs-you',
      count: 2,
    });
    expect(hostRowBadge({ status: 'online', pending: 0, unread: 5 })).toEqual({
      tone: 'unread',
      count: 5,
    });
    expect(hostRowBadge({ status: 'online', pending: 0, unread: 0 })).toBeUndefined();
    expect(hostRowBadge({ status: 'offline' })).toBeUndefined();
  });

  it('caps a badge count at 99+', () => {
    expect(badgeCount(7)).toBe('7');
    expect(badgeCount(99)).toBe('99');
    expect(badgeCount(100)).toBe('99+');
  });

  it('says a Host it has not heard from yet is being checked', () => {
    const [, row] = hostDrawerRows([studio, laptop], 'studio', {}, { status: 'online' });
    expect(row?.glance).toEqual({ status: 'checking' });
  });

  it('reads the current Host from its live connection', () => {
    expect(liveGlance(connection('connecting'), { status: 'loading' })).toEqual({
      status: 'checking',
    });
    expect(liveGlance(connection('unreachable'), ready(4))).toEqual({ status: 'offline' });
    expect(liveGlance(connection('refused'), ready(4))).toEqual({ status: 'offline' });
    expect(liveGlance(connection('connected'), { status: 'loading' })).toEqual({
      status: 'online',
    });
  });
});

describe('Host glances', () => {
  it('counts what needs the Human and what is unread on a Host', async () => {
    const client = answering(async (_method, args) => ({
      items: items(args?.['category'] === 'action' ? 2 : 3),
    }));
    await expect(glanceHost(client)).resolves.toEqual({ status: 'online', pending: 2, unread: 3 });
    expect(client.call).toHaveBeenCalledWith('humanAttention', { category: 'action', limit: 100 });
    expect(client.call).toHaveBeenCalledWith('humanAttention', { category: 'unread', limit: 100 });
  });

  it('marks a Host offline when it cannot be reached', async () => {
    const client = answering(async () => {
      throw new Error('The Host could not be reached.');
    });
    await expect(glanceHost(client)).resolves.toEqual({ status: 'offline' });
  });

  it('checks each other Host while the drawer is open and ignores answers after it closes', async () => {
    let releaseTower: (value: unknown) => void = () => undefined;
    const clients: Record<string, HostClient> = {
      laptop: answering(async () => ({ items: items(1) })),
      tower: answering(() => new Promise((resolve) => (releaseTower = resolve))),
    };
    const glances = createHostGlances((saved) => clients[saved.hostId]!);
    const listener = vi.fn();
    glances.subscribe(listener);

    const stop = glances.watch([laptop, tower]);
    expect(glances.getSnapshot()).toEqual({
      laptop: { status: 'checking' },
      tower: { status: 'checking' },
    });
    await vi.waitFor(() =>
      expect(glances.getSnapshot()['laptop']).toEqual({ status: 'online', pending: 1, unread: 1 }),
    );

    stop();
    releaseTower({ items: items(5) });
    await Promise.resolve();
    expect(glances.getSnapshot()['tower']).toEqual({ status: 'checking' });
    expect(listener).toHaveBeenCalled();
  });
});
