import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import {
  createPushDelivery,
  PushSendError,
  type ExpoMessage,
  type ExpoReceipt,
  type ExpoSender,
  type ExpoTicket,
  type PushCandidate,
  type PushDelivery,
  type PushEvent,
} from '../src/push/delivery.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

export const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
export const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';
export const TOKEN_C = 'ExponentPushToken[cccccccccccccccccccccc]';
export const SECRET_TEXT = 'rm -rf ~/private --token=hunter2';

function fakeExpo() {
  const sent: ExpoMessage[][] = [];
  const failures: PushSendError[] = [];
  const tickets: Array<(message: ExpoMessage) => ExpoTicket> = [];
  const receipts: Record<string, ExpoReceipt> = {};
  let next = 0;
  const sender: ExpoSender = {
    async send(messages) {
      const failure = failures.shift();
      if (failure !== undefined) throw failure;
      sent.push(messages);
      return messages.map(
        (message) => tickets.shift()?.(message) ?? { status: 'ok', id: `ticket-${String(++next)}` },
      );
    },
    async receipts(ids) {
      return Object.fromEntries(ids.flatMap((id) => (receipts[id] ? [[id, receipts[id]]] : [])));
    },
  };
  return { sender, sent, failures, tickets, receipts, flat: () => sent.flat() };
}

export function fixture() {
  const home = createTempRoot('botharness-push-');
  let clock = Date.parse('2026-10-14T08:00:00.000Z');
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'studio',
    now: () => clock,
    onRevoked: (deviceId) => push.unregister(deviceId),
  });
  const expo = fakeExpo();
  const events: PushEvent[] = [];
  let items: PushCandidate[] = [];
  let badge = 0;
  let held = false;
  const push: PushDelivery = createPushDelivery({
    database: attachOperationalModule(owner, 'push'),
    source: {
      pending: () => ({ items, badge }),
      botName: (slug) => (slug === 'ada' ? 'Ada' : undefined),
    },
    sender: expo.sender,
    host: () => pairing.host(),
    deviceActive: (deviceId) =>
      pairing.list().some((device) => device.id === deviceId && device.revokedAt === undefined),
    held: () => held,
    now: () => clock,
    sleep: async () => {},
    record: (event) => events.push(event),
  });
  const device = (name: string) => {
    const paired = pairing.redeem({ offer: pairing.createOffer().offer, name });
    if (!paired.ok) throw new Error('pairing failed');
    return paired;
  };
  const at = (ms: number) => new Date(clock + ms).toISOString();
  return {
    owner,
    pairing,
    push,
    expo,
    events,
    device,
    at,
    advance: (ms: number) => {
      clock += ms;
    },
    hold(next: boolean) {
      held = next;
    },
    setInbox(next: PushCandidate[], count = next.length) {
      items = next;
      badge = count;
    },
    tokenRows: () =>
      attachOperationalModule(owner, 'push').read((db) =>
        db.prepare('SELECT device_id, token FROM push_devices').all(),
      ) as Array<{
        device_id: string;
        token: string;
      }>,
  };
}

export const approval = (id: string, createdAt: string): PushCandidate => ({
  id,
  kind: 'approval',
  attentionKind: 'tool-approval',
  botSlug: 'ada',
  createdAt,
  channelId: 'dm-ada',
  messageId: `msg-${id}`,
  categoryId: 'tool-approval',
});
