import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createDeviceGateway } from '../src/devices/gateway.js';
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
import { createExpoSender } from '../src/push/expo-sender.js';
import { createDevicePushHttp } from '../src/push/http.js';
import { humanInboxPushSource } from '../src/push/source.js';
import type { HumanAttentionItem } from '../src/runtime/human-attention.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';
const TOKEN_C = 'ExponentPushToken[cccccccccccccccccccccc]';
const SECRET_TEXT = 'rm -rf ~/private --token=hunter2';

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

function fixture() {
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

const approval = (id: string, createdAt: string): PushCandidate => ({
  id,
  kind: 'approval',
  attentionKind: 'tool-approval',
  botSlug: 'ada',
  createdAt,
  channelId: 'dm-ada',
  messageId: `msg-${id}`,
  categoryId: 'tool-approval',
});

describe('Push delivery', () => {
  it('sends one notification per enabled device for a new approval', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    const tablet = f.device('Tablet');
    expect(f.push.register(phone.device.id, { token: TOKEN_A, platform: 'ios' })).toEqual({
      ok: true,
    });
    f.push.register(tablet.device.id, { token: TOKEN_B, platform: 'android' });
    f.advance(1000);
    f.setInbox([approval('approval:1', f.at(0))]);

    await f.push.reconcile();
    await f.push.reconcile();

    const messages = f.expo.flat();
    expect(messages.map((message) => message.to).sort()).toEqual([TOKEN_A, TOKEN_B]);
    expect(messages[0]).toEqual({
      to: expect.any(String),
      title: 'Ada',
      body: 'Needs your approval',
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'requests',
      categoryId: 'tool-approval',
      mutableContent: true,
      data: {
        v: 1,
        hostId: f.pairing.host().id,
        itemId: 'approval:1',
        kind: 'tool-approval',
        botSlug: 'ada',
        channelId: 'dm-ada',
        messageId: 'msg-approval:1',
        sender: 'Ada',
        text: 'Needs your approval',
      },
    });
    expect(JSON.stringify(f.events)).not.toMatch(/ExponentPushToken/u);
  });

  it('titles a notification with its Channel and puts the request and its content below', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    const tablet = f.device('Tablet');
    f.push.register(phone.device.id, { token: TOKEN_A, platform: 'ios' });
    f.push.register(tablet.device.id, { token: TOKEN_B, platform: 'ios', locale: 'zh' });
    f.advance(1000);
    const at = f.at(0);
    f.setInbox([
      {
        ...approval('approval:1', at),
        channelId: 'g1',
        channelName: 'ops',
        preview: 'bash · date',
      },
      {
        id: 'question:1',
        kind: 'question',
        attentionKind: 'user-question',
        botSlug: 'ada',
        createdAt: at,
        channelId: 'dm-ada',
        preview: 'Which branch?',
      },
      {
        id: 'reply:1',
        kind: 'reply',
        attentionKind: 'channel-mention',
        botSlug: 'ada',
        createdAt: at,
        channelId: 'g1',
        channelName: 'ops',
        preview: 'Done, see the log',
      },
      {
        id: 'reply:2',
        kind: 'reply',
        attentionKind: 'channel-reply',
        botSlug: 'ada',
        createdAt: at,
      },
    ]);
    await f.push.reconcile();
    const shown = (token: string) =>
      f.expo
        .flat()
        .filter((message) => message.to === token)
        .map(({ title, body }) => [title, body]);
    expect(shown(TOKEN_A)).toEqual([
      ['#ops', 'Ada needs your approval: bash · date'],
      ['Ada', 'Has a question for you: Which branch?'],
      ['#ops', 'Ada: Done, see the log'],
      ['Ada', 'Ada replied to you'],
    ]);
    expect(shown(TOKEN_B)).toEqual([
      ['#ops', 'Ada 需要你审批：bash · date'],
      ['Ada', '有问题问你：Which branch?'],
      ['#ops', 'Ada：Done, see the log'],
      ['Ada', 'Ada 回复了你'],
    ]);
    expect(
      f.expo
        .flat()
        .filter((message) => message.to === TOKEN_A)
        .map(({ data }) => [data.sender, data.group, data.text]),
    ).toEqual([
      ['Ada', 'ops', 'Needs your approval: bash · date'],
      ['Ada', undefined, 'Has a question for you: Which branch?'],
      ['Ada', 'ops', 'Done, see the log'],
      ['Ada', undefined, 'Ada replied to you'],
    ]);
  });

  it('sends a data-only push to an Android app that draws its own notifications', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    const older = f.device('Older');
    f.push.register(phone.device.id, { token: TOKEN_A, platform: 'android', render: 'app' });
    f.push.register(older.device.id, { token: TOKEN_B, platform: 'android', render: 'system' });
    f.advance(1000);
    f.setInbox([{ ...approval('approval:1', f.at(0)), channelId: 'g1', channelName: 'ops' }]);
    await f.push.reconcile();
    const [drawn] = f.expo.flat().filter((message) => message.to === TOKEN_A);
    const [system] = f.expo.flat().filter((message) => message.to === TOKEN_B);
    expect(drawn).not.toHaveProperty('title');
    expect(drawn).not.toHaveProperty('body');
    expect(drawn).toMatchObject({ priority: 'high', categoryId: 'tool-approval' });
    expect(drawn?.data).toMatchObject({
      title: '#ops',
      message: 'Ada needs your approval',
      text: 'Needs your approval',
      sender: 'Ada',
      group: 'ops',
      categoryId: 'tool-approval',
    });
    expect(system).toMatchObject({ title: '#ops', body: 'Ada needs your approval' });
    expect(system?.data).not.toHaveProperty('title');
  });

  it('does not notify items from before registration, and keeps restarts from resending', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    f.setInbox([approval('approval:old', f.at(-60_000))]);
    f.push.register(phone.device.id, { token: TOKEN_A, platform: 'ios' });
    await f.push.reconcile();
    expect(f.expo.flat().filter((message) => message.title !== undefined)).toEqual([]);

    f.advance(1000);
    f.setInbox([approval('approval:old', f.at(-61_000)), approval('approval:new', f.at(0))]);
    await f.push.reconcile();
    expect(f.expo.flat().filter((message) => message.title !== undefined)).toHaveLength(1);

    const restarted = createPushDelivery({
      database: attachOperationalModule(f.owner, 'push'),
      source: {
        pending: () => ({
          items: [approval('approval:old', f.at(-61_000)), approval('approval:new', f.at(0))],
          badge: 2,
        }),
        botName: () => 'Ada',
      },
      sender: f.expo.sender,
      host: () => f.pairing.host(),
      deviceActive: () => true,
    });
    const before = f.expo.flat().length;
    await restarted.reconcile();
    expect(f.expo.flat().length).toBe(before);
  });

  it('sends no stale notification when resolved elsewhere first, and updates the badge', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    f.push.register(phone.device.id, { token: TOKEN_A, platform: 'ios' });
    f.advance(1000);
    f.setInbox([approval('approval:1', f.at(0)), approval('approval:2', f.at(0))]);
    await f.push.reconcile();
    expect(f.expo.flat().map((message) => message.badge)).toEqual([2, 2]);

    f.setInbox([approval('approval:2', f.at(0))]);
    await f.push.reconcile();
    expect(f.expo.sent.at(-1)).toEqual([
      { to: TOKEN_A, badge: 1, data: { v: 1, hostId: f.pairing.host().id } },
    ]);

    f.advance(1000);
    f.setInbox([]);
    await f.push.reconcile();
    await f.push.reconcile();
    expect(f.expo.flat().filter((message) => message.title !== undefined)).toHaveLength(2);
    expect(f.expo.flat().at(-1)?.badge).toBe(0);
    expect(f.expo.sent).toHaveLength(3);
  });

  it('respects per-kind preferences without flooding when a kind is turned back on', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    f.push.register(phone.device.id, { token: TOKEN_A, platform: 'ios' });
    expect(
      f.push.setPreferences(phone.device.id, { approval: false, reply: 'nope' }).preferences,
    ).toEqual({ approval: false, question: true, 'private-input': true, reply: true });
    f.advance(1000);
    const question: PushCandidate = {
      id: 'question:1',
      kind: 'question',
      attentionKind: 'user-question',
      botSlug: 'ada',
      createdAt: f.at(0),
    };
    f.setInbox([approval('approval:1', f.at(0)), question]);
    await f.push.reconcile();
    expect(f.expo.flat().map((message) => message.body)).toEqual(['Has a question for you']);

    f.push.setPreferences(phone.device.id, { approval: true });
    await f.push.reconcile();
    expect(f.expo.flat().filter((message) => message.title !== undefined)).toHaveLength(1);
  });

  it('sends nothing while this device has notifications off, without flooding when they come back', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    f.push.register(phone.device.id, { token: TOKEN_A, platform: 'ios' });
    expect(f.push.setPreferences(phone.device.id, { reply: false }, false)).toMatchObject({
      enabled: false,
      preferences: { reply: false, approval: true },
    });
    f.advance(1000);
    f.setInbox([approval('approval:1', f.at(0))]);
    await f.push.reconcile();
    expect(f.expo.sent).toEqual([]);

    expect(f.push.setPreferences(phone.device.id, undefined, true)).toMatchObject({
      enabled: true,
      preferences: { reply: false },
    });
    await f.push.reconcile();
    expect(f.expo.flat().filter((message) => message.title !== undefined)).toEqual([]);
    f.setInbox([approval('approval:1', f.at(0)), approval('approval:2', f.at(0))]);
    await f.push.reconcile();
    expect(
      f.expo
        .flat()
        .filter((message) => message.title !== undefined)
        .map((message) => message.data.itemId),
    ).toEqual(['approval:2']);
  });

  it('keeps a quiet Channel to its requests on this device only', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    const tablet = f.device('Tablet');
    f.push.register(phone.device.id, { token: TOKEN_A, platform: 'ios' });
    f.push.register(tablet.device.id, { token: TOKEN_B, platform: 'ios' });
    expect(f.push.setQuiet(phone.device.id, { channelId: 'g1', quiet: true })).toMatchObject({
      quietChannelIds: ['g1'],
    });
    expect(f.push.setQuiet(phone.device.id, { channelId: '', quiet: true })).toEqual({
      invalid: true,
    });
    expect(f.push.setQuiet('nobody', { channelId: 'g1', quiet: true })).toEqual({
      registered: false,
    });
    f.advance(1000);
    const reply: PushCandidate = {
      id: 'reply:1',
      kind: 'reply',
      attentionKind: 'channel-mention',
      botSlug: 'ada',
      createdAt: f.at(0),
      channelId: 'g1',
      channelName: 'ops',
    };
    f.setInbox([reply, { ...approval('approval:1', f.at(0)), channelId: 'g1' }]);
    await f.push.reconcile();
    const items = (token: string) =>
      f.expo
        .flat()
        .filter((message) => message.to === token)
        .map((message) => message.data.itemId);
    expect(items(TOKEN_A)).toEqual(['approval:1']);
    expect(items(TOKEN_B)).toEqual(['reply:1', 'approval:1']);

    expect(f.push.setQuiet(phone.device.id, { channelId: 'g1', quiet: false })).toMatchObject({
      quietChannelIds: [],
    });
    expect(f.push.settings(phone.device.id)).toMatchObject({ enabled: true, quietChannelIds: [] });
  });

  it('stops and removes the token when the device is revoked', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    f.push.register(phone.device.id, { token: TOKEN_A, platform: 'ios' });
    f.pairing.revoke(phone.device.id);
    expect(f.tokenRows()).toEqual([]);
    f.advance(1000);
    f.setInbox([approval('approval:1', f.at(0))]);
    await f.push.reconcile();
    expect(f.expo.sent).toEqual([]);
    expect(f.events).toContainEqual({ phase: 'unregistered', deviceId: phone.device.id });
  });

  it('drops a token Expo reports invalid, from a ticket or a later receipt', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    const tablet = f.device('Tablet');
    f.push.register(phone.device.id, { token: TOKEN_A, platform: 'ios' });
    f.push.register(tablet.device.id, { token: TOKEN_B, platform: 'android' });
    f.advance(1000);
    f.expo.tickets.push(
      (message) =>
        message.to === TOKEN_A
          ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
          : { status: 'ok', id: 'ticket-b' },
      (message) =>
        message.to === TOKEN_A
          ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
          : { status: 'ok', id: 'ticket-b' },
    );
    f.setInbox([approval('approval:1', f.at(0))]);
    await f.push.reconcile();
    expect(f.tokenRows().map((row) => row.device_id)).toEqual([tablet.device.id]);
    expect(f.events).toContainEqual({
      phase: 'token-dropped',
      deviceId: phone.device.id,
      code: 'device-not-registered',
    });

    f.expo.receipts['ticket-b'] = { status: 'error', details: { error: 'DeviceNotRegistered' } };
    await f.push.checkReceipts();
    expect(f.tokenRows()).toHaveLength(1);
    f.advance(15 * 60 * 1000);
    await f.push.checkReceipts();
    expect(f.tokenRows()).toEqual([]);
  });

  it('retries a failed send within bounds and records the outcome without content', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    f.push.register(phone.device.id, { token: TOKEN_A, platform: 'ios' });
    f.advance(1000);
    f.expo.failures.push(new PushSendError('expo-503', true));
    f.setInbox([approval('approval:1', f.at(0))]);
    await f.push.reconcile();
    expect(f.expo.flat()).toHaveLength(1);
    expect(f.events).toContainEqual({
      phase: 'retry',
      deviceId: phone.device.id,
      attempt: 1,
      code: 'expo-503',
    });

    f.expo.failures.push(...[1, 2, 3].map(() => new PushSendError('expo-503', true)));
    f.setInbox([approval('approval:1', f.at(0)), approval('approval:2', f.at(0))]);
    await f.push.reconcile();
    expect(f.events).toContainEqual({
      phase: 'send-failed',
      deviceId: phone.device.id,
      count: 1,
      code: 'expo-503',
    });
    expect(f.expo.failures).toEqual([]);
  });

  it('refuses malformed tokens, moves a token to its new device and sends a test', async () => {
    const f = fixture();
    const first = f.device('Phone');
    expect(f.push.register(first.device.id, { token: 'not-a-token', platform: 'ios' })).toEqual({
      ok: false,
      code: 'push-token-invalid',
    });
    expect(await f.push.test(first.device.id)).toBe('not-registered');
    f.push.register(first.device.id, { token: TOKEN_A, platform: 'ios' });
    const again = f.device('Phone (paired again)');
    f.push.register(again.device.id, { token: TOKEN_A, platform: 'ios', locale: 'zh' });
    expect(f.tokenRows()).toEqual([{ device_id: again.device.id, token: TOKEN_A }]);
    expect(await f.push.test(again.device.id)).toBe('sent');
    expect(f.expo.flat().at(-1)).toMatchObject({
      to: TOKEN_A,
      title: '通知已开启',
      body: '来自 studio。',
      data: { v: 1, hostId: f.pairing.host().id, test: true },
    });
  });

  it('tells the other phones about a new pairing so they can remove it', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    const tablet = f.device('Tablet');
    const muted = f.device('Muted');
    f.push.register(phone.device.id, { token: TOKEN_A, platform: 'ios', locale: 'zh' });
    f.push.register(tablet.device.id, { token: TOKEN_B, platform: 'android' });
    f.push.register(muted.device.id, { token: TOKEN_C, platform: 'ios' });
    f.push.setPreferences(muted.device.id, {}, false);
    const added = f.device('Stranger');
    await f.push.announcePaired(added.device);
    expect(f.expo.flat()).toEqual([
      expect.objectContaining({
        to: TOKEN_A,
        title: '有新设备配对',
        body: 'Stranger 现在可以使用 studio。不是你？请移除它。',
        categoryId: 'device-paired',
        data: {
          v: 1,
          hostId: f.pairing.host().id,
          kind: 'device-paired',
          deviceId: added.device.id,
        },
      }),
      expect.objectContaining({ to: TOKEN_B, title: 'New device paired' }),
    ]);
    f.push.register(added.device.id, { token: 'ExponentPushToken[stranger-1]', platform: 'ios' });
    f.pairing.revoke(tablet.device.id);
    await f.push.announcePaired(added.device);
    expect(
      f.expo
        .flat()
        .slice(2)
        .map((message) => message.to),
    ).toEqual([TOKEN_A]);
  });
});

describe('Human Inbox push source', () => {
  it('projects approvals, questions, private input and unread replies with a short preview', () => {
    const item = (over: Partial<HumanAttentionItem>): HumanAttentionItem => ({
      id: 'x',
      category: 'action',
      kind: 'tool-approval',
      createdAt: '2026-10-14T08:00:00.000Z',
      botSlug: 'ada',
      summary: '请求批准执行 bash',
      ...over,
    });
    const source = humanInboxPushSource(
      {
        list: ({ category }) => ({
          items:
            category === 'action'
              ? [
                  item({
                    id: 'approval:1',
                    channelId: 'dm-ada',
                    channelName: 'Ada',
                    messageId: 'm',
                  }),
                  item({ id: 'approval:2', channelId: 'g1', channelName: 'ops', messageId: 'n' }),
                  item({ id: 'join:1', kind: 'group-join-request' }),
                  item({ id: 'secret:1', kind: 'private-input', summary: SECRET_TEXT }),
                  item({ id: 'question:1', kind: 'user-question', summary: 'Which\n  branch?' }),
                ]
              : [
                  item({
                    id: 'reply:1',
                    category: 'replies',
                    kind: 'channel-mention',
                    summary: 'x'.repeat(300),
                  }),
                  item({
                    id: 'reply:2',
                    category: 'replies',
                    kind: 'channel-reply',
                    isUnread: false,
                  }),
                ],
        }),
        actionCount: () => 3,
        dmReplies: () => [
          item({
            id: 'dm-reply:1',
            category: 'replies',
            kind: 'channel-reply',
            channelId: 'dm-ada',
            summary: 'Done',
            isUnread: true,
          }),
        ],
      },
      () => 'Ada',
      (_, messageId) =>
        messageId === 'm'
          ? {
              toolName: 'bash',
              input: JSON.stringify({ description: 'x', command: 'date > now' }),
              allowAlways: true,
            }
          : { toolName: 'secret_cli', input: '{}', allowAlways: true },
    );
    const pending = source.pending();
    expect(pending.badge).toBe(3);
    expect(
      pending.items.map((entry) => [
        entry.id,
        entry.kind,
        entry.channelName,
        entry.preview,
        entry.categoryId,
      ]),
    ).toEqual([
      ['approval:1', 'approval', undefined, 'bash · date > now', 'tool-approval'],
      ['approval:2', 'approval', 'ops', 'secret_cli', 'tool-approval-once'],
      ['join:1', 'approval', undefined, '请求批准执行 bash', undefined],
      ['secret:1', 'private-input', undefined, undefined, undefined],
      ['question:1', 'question', undefined, 'Which branch?', undefined],
      ['reply:1', 'reply', undefined, `${'x'.repeat(139)}…`, undefined],
      ['dm-reply:1', 'reply', undefined, 'Done', undefined],
    ]);
    expect(JSON.stringify(pending)).not.toContain(SECRET_TEXT);
  });

  it('offers Always allow from the notification only when the Host offers it', () => {
    const source = humanInboxPushSource(
      {
        list: ({ category }) => ({
          items:
            category === 'action'
              ? [
                  {
                    id: 'approval:human-only',
                    category: 'action',
                    kind: 'tool-approval',
                    createdAt: '2026-10-14T08:00:00.000Z',
                    botSlug: 'ada',
                    summary: '请求批准执行 bash',
                    channelId: 'dm-ada',
                    messageId: 'm',
                  },
                ]
              : [],
        }),
        actionCount: () => 1,
        dmReplies: () => [],
      },
      () => 'Ada',
      () => ({ toolName: 'bash', input: '{"command":"deepseekbot grant-write-set"}' }),
    );
    expect(source.pending().items.map((entry) => entry.categoryId)).toEqual(['tool-approval-once']);
  });

  it('notifies a folder request as an approval that opens the app, with its reason', () => {
    const lookup = vi.fn(() => ({ toolName: 'bash', input: '{}', allowAlways: true }));
    const source = humanInboxPushSource(
      {
        list: ({ category }) => ({
          items:
            category === 'action'
              ? [
                  {
                    id: 'grant:e1',
                    category: 'action',
                    kind: 'workspace-grant-request',
                    createdAt: '2026-10-14T08:00:00.000Z',
                    botSlug: 'ada',
                    summary: 'I need to write the report into your project folder.',
                    channelId: 'dm-ada',
                    messageId: 'g1',
                  },
                ]
              : [],
        }),
        actionCount: () => 1,
        dmReplies: () => [],
      },
      () => 'Ada',
      lookup,
    );
    expect(source.pending().items).toEqual([
      {
        id: 'grant:e1',
        kind: 'approval',
        attentionKind: 'workspace-grant-request',
        botSlug: 'ada',
        createdAt: '2026-10-14T08:00:00.000Z',
        channelId: 'dm-ada',
        messageId: 'g1',
        preview: 'I need to write the report into your project folder.',
      },
    ]);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('notifies auto-rejections and join requests as approvals and Assignment asks as questions', () => {
    const item = (id: string, kind: string, summary: string) => ({
      id,
      category: 'action' as const,
      kind: kind as 'tool-approval',
      createdAt: '2026-10-14T08:00:00.000Z',
      botSlug: 'ada',
      summary,
      channelId: 'dm-ada',
    });
    const source = humanInboxPushSource(
      {
        list: ({ category }) => ({
          items:
            category === 'action'
              ? [
                  item('autoreject:e1', 'auto-rejection', 'Rejected by the template'),
                  item('join:r1', 'group-join-request', ''),
                  item('assignment:s1', 'assignment-waiting-human', 'Which region?'),
                  item('assignment:s2', 'assignment-blocked', 'Build is failing'),
                  item('repair:e2:ada', 'bot-message-needs-repair', 'Check this'),
                ]
              : [],
        }),
        actionCount: () => 5,
        dmReplies: () => [],
      },
      () => 'Ada',
    );
    expect(
      source
        .pending()
        .items.map((entry) => [entry.id, entry.kind, entry.preview, entry.categoryId]),
    ).toEqual([
      ['autoreject:e1', 'approval', 'Rejected by the template', undefined],
      ['join:r1', 'approval', undefined, undefined],
      ['assignment:s1', 'question', 'Which region?', undefined],
      ['assignment:s2', 'question', 'Build is failing', undefined],
    ]);
  });
});

describe('Expo sender', () => {
  it('posts to Expo Push Service and classifies failures for retry', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const answers = [
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 't1' }] }), { status: 200 }),
      new Response('busy', { status: 503 }),
      new Response(JSON.stringify({ errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS' }] }), {
        status: 400,
      }),
    ];
    const sender = createExpoSender((async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return answers.shift()!;
    }) as typeof fetch);
    const message: ExpoMessage = { to: TOKEN_A, badge: 0, data: { v: 1, hostId: 'h' } };
    expect(await sender.send([message])).toEqual([{ status: 'ok', id: 't1' }]);
    expect(calls[0]).toEqual({ url: 'https://exp.host/--/api/v2/push/send', body: [message] });
    await expect(sender.send([message])).rejects.toMatchObject({ retryable: true });
    await expect(sender.send([message])).rejects.toMatchObject({ retryable: false });
  });
});

const servers: Server[] = [];
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
});

describe('Device gateway push endpoints', () => {
  it('registers, reads and changes the admitted device’s own settings, and refuses strangers', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    const gateway = createDeviceGateway({
      pairing: f.pairing,
      port: () => 1,
      authenticatedUrl: (base) => base,
      push: createDevicePushHttp(f.push),
    });
    const server = createServer((req, res) => void gateway.handle(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/botharness-device/push`;
    const call = async (path: string, body?: unknown, credential = phone.credential) => {
      const response = await fetch(`${base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Device ${credential}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    };

    expect(await call('')).toMatchObject({ status: 200, body: { registered: false } });
    expect(await call('/register', { token: TOKEN_A, platform: 'ios' })).toMatchObject({
      status: 200,
      body: { registered: true, preferences: { approval: true } },
    });
    expect(await call('/preferences', { preferences: { reply: false } })).toMatchObject({
      status: 200,
      body: { preferences: { reply: false } },
    });
    expect(await call('/preferences', { enabled: false })).toMatchObject({
      status: 200,
      body: { enabled: false, preferences: { reply: false } },
    });
    expect(await call('/quiet', { channelId: 'g1', quiet: true })).toMatchObject({
      status: 200,
      body: { quietChannelIds: ['g1'] },
    });
    expect(await call('/quiet', { channelId: 'g1' })).toEqual({
      status: 400,
      body: { code: 'invalid-input' },
    });
    expect(await call('/test', {})).toEqual({ status: 200, body: { sent: true } });
    expect(
      await call('', undefined, 'aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
    ).toEqual({
      status: 401,
      body: { code: 'device-unknown' },
    });
    expect(await call('/unregister', {})).toEqual({ status: 200, body: { registered: false } });
    expect(f.tokenRows()).toEqual([]);
  });
});
