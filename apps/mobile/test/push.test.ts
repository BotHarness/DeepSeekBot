import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  attachOperationalModule,
  mountOperationalDatabase,
} from '../../../packages/core/src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../../../packages/core/src/database/schema-plan.js';
import { createDeviceGateway } from '../../../packages/core/src/devices/gateway.js';
import { createDevicePairing } from '../../../packages/core/src/devices/pairing.js';
import { createPushDelivery, type ExpoMessage } from '../../../packages/core/src/push/delivery.js';
import { createDevicePushHttp } from '../../../packages/core/src/push/http.js';
import {
  parseSavedHosts,
  selectHost,
  withHost,
  withoutHost,
  type SavedHost,
} from '../src/host/hosts';
import { createHostPush, parsePushData, pushHref, PushRequestFailed } from '../src/host/push';
import { decideFromPush, registerApprovalCategories } from '../src/host/push-actions';
import {
  createPushSession,
  type NotificationsPort,
  type PermissionState,
} from '../src/host/push-session';
import { nodeCarrier } from './node-carrier';

const host = (id: string): SavedHost => ({
  hostId: id,
  hostName: `Mac ${id}`,
  routes: ['https://mac.tailnet.ts.net'],
  deviceId: `device-${id}`,
  credential: `cred-${id}`,
});

describe('paired Hosts', () => {
  it('adopts the single Host an older build saved, then adds, switches and removes Hosts', () => {
    const legacy = parseSavedHosts(null, JSON.stringify(host('a')));
    expect(legacy).toEqual({ hosts: [host('a')], current: 'a' });
    const two = withHost(legacy, host('b'));
    expect(two.current).toBe('b');
    expect(selectHost(two, 'a')?.current).toBe('a');
    expect(selectHost(two, 'zzz')).toBeUndefined();
    expect(
      withHost(two, { ...host('a'), credential: 'new' }).hosts.map((h) => h.credential),
    ).toEqual(['cred-b', 'new']);
    expect(withoutHost(two, 'b')).toEqual({ hosts: [host('a')], current: 'a' });
    expect(withoutHost(withoutHost(two, 'b'), 'a')).toEqual({ hosts: [] });
    expect(parseSavedHosts(JSON.stringify(two), null)).toEqual(two);
    expect(parseSavedHosts('{', null)).toEqual({ hosts: [] });
  });
});

describe('notification taps', () => {
  const approval = {
    v: 1,
    hostId: 'h2',
    itemId: 'approval:e1',
    kind: 'tool-approval',
    botSlug: 'ada',
    channelId: 'dm-ada',
    messageId: 'm1',
  };

  it('reads only the ids the Host sent and opens its card in the DM, or the item outside a DM', () => {
    expect(parsePushData({ ...approval, body: 'secret' })).toEqual({
      hostId: 'h2',
      itemId: 'approval:e1',
      kind: 'tool-approval',
      botSlug: 'ada',
      channelId: 'dm-ada',
      messageId: 'm1',
    });
    expect(parsePushData({ hostId: 'h2' })).toBeUndefined();
    expect(pushHref(parsePushData(approval)!, () => 'dm-ada')).toEqual({
      pathname: '/dm/[slug]',
      params: { slug: 'ada', focus: 'm1' },
    });
    expect(pushHref(parsePushData(approval)!, () => 'dm-other')).toEqual({
      pathname: '/inbox/[id]',
      params: {
        id: 'approval:e1',
        kind: 'tool-approval',
        botSlug: 'ada',
        channelId: 'dm-ada',
        messageId: 'm1',
      },
    });
  });

  it('opens a DM reply in the DM, a group mention as its Inbox item, and a badge or test as Activity', () => {
    const reply = parsePushData({ ...approval, kind: 'channel-reply' })!;
    expect(pushHref(reply, () => 'dm-ada')).toEqual({
      pathname: '/dm/[slug]',
      params: { slug: 'ada' },
    });
    expect(pushHref({ ...reply, kind: 'channel-mention' }, () => 'other')).toMatchObject({
      pathname: '/inbox/[id]',
    });
    expect(pushHref(parsePushData({ v: 1, hostId: 'h2', test: true })!, () => undefined)).toEqual({
      pathname: '/activity',
    });
  });

  it('opens a group Channel reply, mention or card in that Channel', () => {
    const group = (id: string) => id === 'launch';
    const reply = parsePushData({ ...approval, kind: 'channel-mention', channelId: 'launch' })!;
    expect(pushHref(reply, () => 'dm-ada', group)).toEqual({
      pathname: '/channel/[id]',
      params: { id: 'launch' },
    });
    const card = parsePushData({ ...approval, channelId: 'launch' })!;
    expect(pushHref(card, () => 'dm-ada', group)).toEqual({
      pathname: '/channel/[id]',
      params: { id: 'launch', focus: 'm1' },
    });
    expect(pushHref({ ...card, channelId: 'gone' }, () => 'dm-ada', group)).toMatchObject({
      pathname: '/inbox/[id]',
    });
  });
});

function fakeNotifications(permission: PermissionState) {
  const state = {
    permission,
    badge: -1,
    dismissed: [] as string[],
    presented: [] as Array<{ id: string; data: unknown }>,
    token: 'ExponentPushToken[phone-token-0001]' as string | undefined,
  };
  const port: NotificationsPort = {
    permission: async () => state.permission,
    request: async () => (state.permission = 'granted'),
    token: async () => {
      if (state.token === undefined) throw new Error('missing-project-id');
      return state.token;
    },
    onTokenChanged: () => () => {},
    setBadge: async (count) => {
      state.badge = count;
    },
    presented: async () => state.presented,
    dismiss: async (id) => {
      state.dismissed.push(id);
    },
  };
  return { state, port };
}

const servers: Server[] = [];
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections();
          server.close(resolve);
        }),
    ),
  );
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function realHost() {
  const home = mkdtempSync(join(tmpdir(), 'bh-mobile-push-'));
  roots.push(home);
  const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const sent: ExpoMessage[] = [];
  let items: Array<{ id: string; createdAt: string }> = [];
  let push: ReturnType<typeof createPushDelivery>;
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'studio',
    onRevoked: (deviceId) => push.unregister(deviceId),
  });
  push = createPushDelivery({
    database: attachOperationalModule(owner, 'push'),
    source: {
      pending: () => ({
        items: items.map((item) => ({
          ...item,
          kind: 'approval' as const,
          attentionKind: 'tool-approval',
          botSlug: 'ada',
        })),
        badge: items.length,
      }),
      botName: () => 'Ada',
    },
    sender: {
      send: async (messages) => {
        sent.push(...messages);
        return messages.map((_, index) => ({ status: 'ok' as const, id: `t${String(index)}` }));
      },
      receipts: async () => ({}),
    },
    host: () => pairing.host(),
    deviceActive: (id) => pairing.list().some((d) => d.id === id && d.revokedAt === undefined),
  });
  const gateway = createDeviceGateway({
    pairing,
    port: () => 1,
    authenticatedUrl: (base) => base,
    push: createDevicePushHttp(push),
  });
  const server = createServer((req, res) => void gateway.handle(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const route = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const paired = pairing.redeem({ offer: pairing.createOffer().offer, name: 'Phone' });
  if (!paired.ok) throw new Error('pairing failed');
  const saved: SavedHost = {
    hostId: pairing.host().id,
    hostName: 'studio',
    routes: ['http://127.0.0.1:1', route],
    deviceId: paired.device.id,
    credential: paired.credential,
  };
  return {
    saved,
    sent,
    push,
    pairing,
    owner,
    raise: (id: string) => {
      items = [...items, { id, createdAt: new Date(Date.now() + 1000).toISOString() }];
    },
    resolve: (id: string) => {
      items = items.filter((item) => item.id !== id);
    },
  };
}

describe('notification buttons', () => {
  const approval = {
    hostId: 'h2',
    itemId: 'approval:e1',
    kind: 'tool-approval',
    botSlug: 'ada',
    channelId: 'dm-ada',
    messageId: 'm1',
  };
  const two = { ...host('h2'), routes: ['https://down.ts.net', 'https://up.ts.net'] };

  it('decides the approval on the Host it came from, trying each route', async () => {
    const calls: string[] = [];
    const result = await decideFromPush(
      [host('h1'), two],
      approval,
      'approve',
      async (target, route, ref, outcome) => {
        calls.push(`${target.hostId} ${route} ${ref.messageId} ${outcome}`);
        if (route.includes('down')) throw new Error('unreachable');
        return 'accepted';
      },
    );
    expect(result).toBe('accepted');
    expect(calls).toEqual([
      'h2 https://down.ts.net m1 allowed-once',
      'h2 https://up.ts.net m1 allowed-once',
    ]);
    expect(
      await decideFromPush([two], approval, 'reject', async (_, __, ___, outcome) =>
        outcome === 'rejected' ? 'decided' : 'accepted',
      ),
    ).toBe('decided');
    const outcomes: string[] = [];
    await decideFromPush([two], approval, 'always', async (_, __, ___, outcome) => {
      outcomes.push(outcome);
      return 'accepted';
    });
    expect(outcomes).toEqual(['allowed-always-tool']);
  });

  it('registers both button sets one after another so neither overwrites the other', async () => {
    let stored = new Map<string, readonly string[]>();
    const read = () =>
      new Promise<Map<string, readonly string[]>>((done) =>
        setTimeout(() => done(new Map(stored)), 0),
      );
    await registerApprovalCategories(async (identifier, buttons) => {
      const current = await read();
      current.set(identifier, buttons);
      stored = current;
    });
    expect(Object.fromEntries(stored)).toEqual({
      'tool-approval': ['always', 'approve', 'reject'],
      'tool-approval-once': ['approve', 'reject'],
    });
  });

  it('ignores other buttons and kinds, and fails for an unpaired or unreachable Host', async () => {
    const never = async (): Promise<never> => {
      throw new Error('called');
    };
    expect(await decideFromPush([two], approval, 'later', never)).toBeUndefined();
    expect(
      await decideFromPush([two], { ...approval, kind: 'user-question' }, 'approve', never),
    ).toBeUndefined();
    expect(await decideFromPush([host('h1')], approval, 'approve', never)).toBe('failed');
    expect(await decideFromPush([two], approval, 'approve', never)).toBe('failed');
  });
});

describe('push registration with a real Host gateway', () => {
  it('registers after the Human allows notifications, honours kinds, tests, and stops on unpair', async () => {
    const h = await realHost();
    const hostPush = createHostPush(nodeCarrier(), 2_000);
    const phone = fakeNotifications('undetermined');
    const session = createPushSession({
      notifications: phone.port,
      hostPush,
      platform: 'ios',
      locale: 'en',
    });

    await session.sync([h.saved]);
    expect(session.getSnapshot()).toEqual({ status: 'off' });
    expect((await hostPush.settings(h.saved)).registered).toBe(false);

    await session.enable([h.saved]);
    expect(session.getSnapshot()).toEqual({ status: 'on', failed: [] });
    expect(await hostPush.settings(h.saved)).toEqual({
      registered: true,
      enabled: true,
      preferences: { approval: true, question: true, 'private-input': true, reply: true },
      quietChannelIds: [],
    });
    expect((await hostPush.setQuiet(h.saved, 'g1', true)).quietChannelIds).toEqual(['g1']);
    expect((await hostPush.setEnabled(h.saved, false)).enabled).toBe(false);
    expect(await hostPush.setEnabled(h.saved, true)).toMatchObject({
      enabled: true,
      quietChannelIds: ['g1'],
    });

    h.raise('approval:1');
    await h.push.reconcile();
    expect(h.sent).toEqual([
      expect.objectContaining({
        to: 'ExponentPushToken[phone-token-0001]',
        title: 'Ada',
        body: 'Needs your approval',
        data: expect.objectContaining({ hostId: h.saved.hostId, itemId: 'approval:1' }),
      }),
    ]);

    expect((await hostPush.setPreferences(h.saved, { approval: false })).preferences.approval).toBe(
      false,
    );
    h.raise('approval:2');
    await h.push.reconcile();
    expect(h.sent.filter((message) => message.title !== undefined)).toHaveLength(1);
    expect(h.sent.at(-1)).toEqual({
      to: 'ExponentPushToken[phone-token-0001]',
      badge: 2,
      data: { v: 1, hostId: h.saved.hostId },
    });

    await hostPush.test(h.saved);
    expect(h.sent.at(-1)).toMatchObject({ title: 'Notifications are on' });

    await session.forget(h.saved);
    expect((await hostPush.settings(h.saved)).registered).toBe(false);
    h.owner.close();
  });

  it('reports a revoked phone and an unavailable build', async () => {
    const h = await realHost();
    const hostPush = createHostPush(nodeCarrier(), 2_000);
    h.pairing.revoke(h.saved.deviceId);
    await expect(hostPush.settings(h.saved)).rejects.toEqual(
      new PushRequestFailed('device-revoked'),
    );

    const phone = fakeNotifications('granted');
    phone.state.token = undefined;
    const session = createPushSession({
      notifications: phone.port,
      hostPush,
      platform: 'android',
      locale: 'zh',
    });
    await session.sync([h.saved]);
    expect(session.getSnapshot()).toEqual({ status: 'unavailable', reason: 'missing-project-id' });

    const silent = fakeNotifications('granted');
    silent.port.token = () => new Promise<string>(() => {});
    const waiting = createPushSession({
      notifications: silent.port,
      hostPush,
      platform: 'ios',
      locale: 'en',
      tokenTimeoutMs: 10,
    });
    await waiting.sync([h.saved]);
    expect(waiting.getSnapshot()).toEqual({ status: 'unavailable', reason: 'push-token-timeout' });
    h.owner.close();
  });

  it('registers a Host that was offline at launch once it is reachable again', async () => {
    const h = await realHost();
    const real = createHostPush(nodeCarrier(), 2_000);
    let offline = true;
    const hostPush = {
      ...real,
      register: (...args: Parameters<typeof real.register>) =>
        offline ? Promise.reject(new Error('unreachable')) : real.register(...args),
    };
    const session = createPushSession({
      notifications: fakeNotifications('granted').port,
      hostPush,
      platform: 'ios',
      locale: 'en',
    });

    await session.sync([h.saved]);
    expect(session.getSnapshot()).toEqual({ status: 'on', failed: [h.saved.hostId] });
    await session.retryFailed();
    expect(session.getSnapshot()).toEqual({ status: 'on', failed: [h.saved.hostId] });

    offline = false;
    await Promise.all([session.retryFailed(), session.retryFailed()]);
    expect(session.getSnapshot()).toEqual({ status: 'on', failed: [] });
    expect((await real.settings(h.saved)).registered).toBe(true);
    h.owner.close();
  });

  it('mirrors the badge and clears banners for items resolved elsewhere', async () => {
    const phone = fakeNotifications('granted');
    phone.state.presented = [
      { id: 'n1', data: { v: 1, hostId: 'h', itemId: 'approval:1', kind: 'tool-approval' } },
      { id: 'n2', data: { v: 1, hostId: 'h', itemId: 'approval:2', kind: 'tool-approval' } },
      { id: 'n3', data: { v: 1, hostId: 'other', itemId: 'approval:1', kind: 'tool-approval' } },
      { id: 'n4', data: { v: 1, hostId: 'h', itemId: 'reply:1', kind: 'channel-reply' } },
    ];
    const session = createPushSession({
      notifications: phone.port,
      hostPush: createHostPush(nodeCarrier()),
      platform: 'ios',
      locale: 'en',
    });
    session.reflect('h', new Set(['approval:2']), 1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(phone.state.badge).toBe(1);
    expect(phone.state.dismissed).toEqual(['n1']);
  });

  it('reflects an unchanged Inbox again after the app returns to the foreground', async () => {
    const phone = fakeNotifications('granted');
    const session = createPushSession({
      notifications: phone.port,
      hostPush: createHostPush(nodeCarrier()),
      platform: 'ios',
      locale: 'en',
    });
    session.reflect('h', new Set(), 0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    phone.state.badge = 1;
    phone.state.presented = [
      { id: 'n1', data: { v: 1, hostId: 'h', itemId: 'approval:1', kind: 'tool-approval' } },
    ];
    session.reflect('h', new Set(), 0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(phone.state.badge).toBe(1);
    session.reflectAgain();
    session.reflect('h', new Set(), 0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(phone.state.badge).toBe(0);
    expect(phone.state.dismissed).toEqual(['n1']);
  });
});
