import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { pairedDeviceHuman, deviceOwnsRequest } from '../src/team/device-audience.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createPushDelivery, type ExpoMessage } from '../src/push/delivery.js';
import { activityListPushSource } from '../src/push/source.js';
import { createActivityDelivery } from '../src/live-activity/delivery.js';
import { OWNER_HUMAN_CONTEXT as owner, humanContext } from '../src/humans/context.js';
import { createTempRoot } from './helpers.js';
import { createPresence } from '../src/push/presence.js';

const bob = humanContext('bob');
const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});
function fixture() {
  const core = createCore({
    dshHome: createTempRoot('team-private-delivery-'),
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      requestAssignment() {
        throw new Error('unexpected');
      },
      async close() {},
    },
  });
  closes.push(async () => {
    await core.runtime.close();
    core.operationalDatabase.close();
  });
  const database = attachOperationalModule(core.operationalDatabase, 'team');
  database.transaction((db) =>
    db
      .prepare("INSERT INTO humans VALUES ('bob', 'Bob', 'active', ?)")
      .run(new Date().toISOString()),
  );
  const pairing = createDevicePairing({ database, hostName: 'test-host' });
  const device = (humanId: string) => {
    const grant = pairing.redeem({ offer: pairing.createOffer().offer, name: humanId + '-phone' });
    if (!grant.ok) throw new Error('pairing-failed');
    database.transaction((db) =>
      db
        .prepare('UPDATE paired_devices SET human_id = ? WHERE device_id = ?')
        .run(humanId, grant.device.id),
    );
    return grant.device.id;
  };
  const ownerDevice = device(owner.humanId);
  const bobDevice = device(bob.humanId);
  const now = new Date(Date.now() + 10_000).toISOString();
  for (const human of [owner, bob]) {
    const slug = human === owner ? 'owner-bot' : 'bob-bot';
    core.registry.create({ slug, displayName: slug, ownerHumanId: human.humanId });
    core.channels.getOrCreateDm(human, slug, slug);
  }
  return { core, database, pairing, ownerDevice, bobDevice, now, device };
}

describe('per-Human device delivery', () => {
  it('holds replies only for the active recipient Human and releases them independently', async () => {
    const f = fixture();
    const presence = createPresence();
    const sent: ExpoMessage[] = [];
    const push = createPushDelivery({
      database: f.database,
      source: activityListPushSource(
        f.core.humanAttention,
        (slug) => f.core.registry.get(slug)?.displayName,
      ),
      sender: {
        async send(messages) {
          sent.push(...messages);
          return messages.map((_, i) => ({ status: 'ok', id: String(i) }));
        },
        async receipts() {
          return {};
        },
      },
      host: () => f.pairing.host(),
      deviceActive: (id) => pairedDeviceHuman(f.database, id) !== undefined,
      deviceHuman: (id) => pairedDeviceHuman(f.database, id),
      held: (human) => presence.active(human),
    });
    const ownerToken = 'ExponentPushToken[ownerownerownerowner]';
    const bobToken = 'ExponentPushToken[bobbobbobbobbobbobbob]';
    push.register(f.ownerDevice, { token: ownerToken, platform: 'ios' });
    push.register(f.bobDevice, { token: bobToken, platform: 'ios' });
    try {
      presence.report('active-owner', true, owner);
      for (const human of [owner, bob]) {
        const slug = human === owner ? 'owner-bot' : 'bob-bot';
        await f.core.channels.appendMessage(human, 'dm-' + slug, {
          id: 'reply-' + slug,
          at: f.now,
          author: { kind: 'bot', slug },
          body: 'Reply for ' + slug,
        });
      }
      await push.reconcile();
      expect(
        sent
          .filter((message) => message.data.kind === 'channel-reply')
          .map((message) => message.to),
      ).toEqual([bobToken]);
      presence.report('active-bob', true, bob);
      presence.report('active-owner', false, owner);
      await push.reconcile();
      expect(
        sent
          .filter((message) => message.data.kind === 'channel-reply')
          .map((message) => message.to),
      ).toEqual([bobToken, ownerToken]);
    } finally {
      presence.dispose();
    }
  });
  it('routes each Activity item and badge only to devices bound to its Human, with one snapshot per Human', async () => {
    const f = fixture();
    const secondBobDevice = f.device('bob');
    const sent: ExpoMessage[] = [];
    const source = activityListPushSource(
      f.core.humanAttention,
      (slug) => f.core.registry.get(slug)?.displayName,
    );
    const pending = vi.spyOn(source, 'pending');
    const push = createPushDelivery({
      database: f.database,
      source,
      sender: {
        async send(messages) {
          sent.push(...messages);
          return messages.map((_, index) => ({ status: 'ok', id: String(index) }));
        },
        async receipts() {
          return {};
        },
      },
      host: () => f.pairing.host(),
      deviceActive: (id) => pairedDeviceHuman(f.database, id) !== undefined,
      deviceHuman: (id) => pairedDeviceHuman(f.database, id),
    });
    const tokens = [
      'ExponentPushToken[ownerownerownerowner]',
      'ExponentPushToken[bobbobbobbobbobbobbob]',
      'ExponentPushToken[bobsecondbobsecondbob]',
    ];
    [f.ownerDevice, f.bobDevice, secondBobDevice].forEach((id, i) =>
      expect(push.register(id, { token: tokens[i], platform: 'ios' })).toEqual({ ok: true }),
    );
    for (const human of [owner, bob]) {
      const slug = human === owner ? 'owner-bot' : 'bob-bot';
      await f.core.channels.appendMessage(human, 'dm-' + slug, {
        id: 'action-' + slug,
        at: f.now,
        author: { kind: 'bot', slug },
        body: 'private-' + slug,
        grantRequest: true,
      });
    }
    await push.reconcile();
    expect(pending).toHaveBeenCalledTimes(2);
    expect(
      sent
        .filter((message) => message.data.botSlug === 'owner-bot')
        .every((message) => message.to === tokens[0]),
    ).toBe(true);
    expect(
      sent
        .filter((message) => message.data.botSlug === 'bob-bot')
        .map((message) => message.to)
        .sort(),
    ).toEqual(tokens.slice(1).sort());
    for (const [index, token] of tokens.entries()) {
      const delivered = sent.filter((message) => message.to === token);
      expect(delivered.length).toBeGreaterThan(0);
      expect(JSON.stringify(delivered)).not.toContain(index === 0 ? 'bob-bot' : 'owner-bot');
      expect(delivered.some((message) => message.badge === 1)).toBe(true);
    }
    expect(pairedDeviceHuman(f.database, f.ownerDevice)).toEqual(owner);
    expect(pairedDeviceHuman(f.database, f.bobDevice)).toEqual(bob);
    f.pairing.revoke(f.bobDevice);
    expect(pairedDeviceHuman(f.database, f.bobDevice)).toBeUndefined();
  });

  it('refuses cross-Human Live Activity prepare/register/status and rechecks the audience during reconciliation', async () => {
    const f = fixture();
    await f.core.channels.appendMessage(bob, 'dm-bob-bot', {
      id: 'bob-request',
      at: f.now,
      author: { kind: 'human', humanId: bob.humanId },
      body: 'member request',
    });
    const event = f.database.read((db) =>
      db
        .prepare("SELECT source_event_id FROM source_events WHERE message_id = 'bob-request'")
        .get(),
    );
    if (typeof event?.source_event_id !== 'string') throw new Error('missing-source');
    const sourceEventId = event.source_event_id;
    const calls: unknown[] = [];
    const delivery = createActivityDelivery({
      database: f.database,
      provider: {
        async capability() {
          return { bundleIdentifier: 'app.deepseekbot.mobile', source: 'test-host' };
        },
        async call(body) {
          calls.push(body);
          return {
            status: 200,
            body: { handle: 'member-handle', expiresAt: Date.now() + 3600000 },
          };
        },
      },
      deviceActive: (id) => pairedDeviceHuman(f.database, id) !== undefined,
      request: (channelId, messageId, deviceId) =>
        deviceId &&
        channelId === 'dm-bob-bot' &&
        messageId === 'bob-request' &&
        deviceOwnsRequest(f.database, deviceId, sourceEventId)
          ? { sourceEventId, progress: { state: 'working', terminal: false, updatedAt: f.now } }
          : undefined,
    });
    closes.push(async () => {
      delivery.dispose();
    });
    const body = {
      channelId: 'dm-bob-bot',
      messageId: 'bob-request',
      bundleIdentifier: 'app.deepseekbot.mobile',
      clientActivityId: 'bob-activity',
      token: 'a'.repeat(64),
    };
    for (const action of ['prepare', 'register']) {
      expect(
        await delivery.handle({
          method: 'POST',
          path: '/botharness-device/activity/' + action,
          deviceId: f.ownerDevice,
          body,
        }),
      ).toMatchObject({ status: 404, body: { code: 'activity-request-not-found' } });
    }
    expect(
      await delivery.handle({
        method: 'POST',
        path: '/botharness-device/activity/prepare',
        deviceId: f.bobDevice,
        body,
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await delivery.handle({
        method: 'POST',
        path: '/botharness-device/activity/register',
        deviceId: f.bobDevice,
        body,
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await delivery.handle({
        method: 'POST',
        path: '/botharness-device/activity/status',
        deviceId: f.ownerDevice,
        body,
      }),
    ).toMatchObject({ status: 404 });
    expect(deviceOwnsRequest(f.database, f.bobDevice, sourceEventId)).toBe(true);
    f.database.transaction((db) =>
      db
        .prepare('UPDATE paired_devices SET human_id = ? WHERE device_id = ?')
        .run(owner.humanId, f.bobDevice),
    );
    expect(
      await delivery.handle({
        method: 'POST',
        path: '/botharness-device/activity/status',
        deviceId: f.bobDevice,
        body,
      }),
    ).toMatchObject({ status: 404 });
    await delivery.reconcile();
    expect(calls).toContainEqual(
      expect.objectContaining({ operation: 'stop', deviceId: f.bobDevice }),
    );
  });
});
