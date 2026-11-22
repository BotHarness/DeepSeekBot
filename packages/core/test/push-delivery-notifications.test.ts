import { describe, expect, it, vi } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import {
  createPushDelivery,
  PushSendError,
  type ExpoTicket,
  type PushCandidate,
} from '../src/push/delivery.js';
import { createDevicePushHttp } from '../src/push/http.js';
import { TOKEN_A, TOKEN_B, TOKEN_C, fixture, approval } from './push-delivery-fixtures.js';

describe('Push delivery', () => {
  it('accepts a device preference before token registration and uses the copy only for sends', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    const http = createDevicePushHttp(f.push);
    const answer = await http({
      method: 'POST',
      path: '/botharness-device/push/preferences',
      deviceId: phone.device.id,
      body: { preferences: { approval: false } },
    });
    expect(answer).toMatchObject({
      status: 200,
      body: { registered: false, preferences: { approval: false } },
    });
    f.push.register(phone.device.id, { token: TOKEN_A, platform: 'ios' });
    expect(f.push.settings(phone.device.id).preferences.approval).toBe(false);
    f.advance(1000);
    f.setInbox([approval('blocked', f.at(0))]);
    await f.push.reconcile();
    expect(f.expo.flat().filter((message) => message.data.itemId)).toEqual([]);
    expect(f.push.settings(phone.device.id).registered).toBe(true);
    f.push.setPreferences(phone.device.id, { approval: true });
    f.advance(1000);
    f.setInbox([approval('new', f.at(0))]);
    await f.push.reconcile();
    expect(
      f.expo
        .flat()
        .filter((message) => message.data.itemId)
        .map((message) => message.data.itemId),
    ).toEqual(['new']);
    expect(
      (
        await http({
          method: 'POST',
          path: '/botharness-device/push/preferences',
          deviceId: phone.device.id,
          body: { preferences: { approval: 'false' } },
        })
      ).status,
    ).toBe(400);
  });
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

  it('records how long after its item was created each push reached Expo', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    f.push.register(phone.device.id, { token: TOKEN_A, platform: 'ios' });
    f.advance(1000);
    f.setInbox([approval('approval:1', f.at(0))]);
    f.advance(2500);
    await f.push.reconcile();
    expect(f.events).toContainEqual({
      phase: 'sent',
      deviceId: phone.device.id,
      kind: 'approval',
      outcome: 'ok',
      ageMs: 2500,
    });

    f.setInbox([], 0);
    await f.push.reconcile();
    expect(f.events.at(-1)).toEqual({
      phase: 'sent',
      deviceId: phone.device.id,
      kind: 'resolve',
      outcome: 'ok',
    });
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
    expect(Object.keys(drawn ?? {}).sort()).toEqual(['data', 'priority', 'to']);
    expect(drawn?.priority).toBe('high');
    expect(drawn?.data).toMatchObject({
      title: '#ops',
      message: 'Ada needs your approval',
      text: 'Needs your approval',
      sender: 'Ada',
      group: 'ops',
      categoryId: 'tool-approval',
      badge: 1,
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
      {
        to: TOKEN_A,
        badge: 1,
        _contentAvailable: true,
        data: { v: 1, hostId: f.pairing.host().id, resolved: ['approval:1'] },
      },
    ]);

    f.advance(1000);
    f.setInbox([]);
    await f.push.reconcile();
    await f.push.reconcile();
    expect(f.expo.flat().filter((message) => message.title !== undefined)).toHaveLength(2);
    expect(f.expo.flat().at(-1)).toEqual({
      to: TOKEN_A,
      _contentAvailable: true,
      data: { v: 1, hostId: f.pairing.host().id, resolved: ['approval:2'], badge: 0 },
    });
    expect(f.expo.sent).toHaveLength(3);
  });

  it('withdraws a reply read on another device without withdrawing a still-unread reply', async () => {
    const f = fixture();
    const ios = f.device('iPhone');
    const android = f.device('Android');
    f.push.register(ios.device.id, { token: TOKEN_A, platform: 'ios' });
    f.push.register(android.device.id, { token: TOKEN_B, platform: 'android', render: 'app' });
    f.advance(1000);
    const read: PushCandidate = {
      id: 'reply:read',
      kind: 'reply',
      attentionKind: 'channel-reply',
      botSlug: 'ada',
      channelId: 'dm-ada',
      createdAt: f.at(0),
    };
    const unread = { ...read, id: 'reply:unread' };
    f.setInbox([read, unread]);
    await f.push.reconcile();
    expect(f.expo.flat().filter((message) => message.data?.itemId === read.id)).toHaveLength(2);

    const before = f.expo.flat().length;
    f.setInbox([unread]);
    await f.push.reconcile();
    await f.push.reconcile();
    const withdrawals = f.expo.flat().slice(before);
    expect(withdrawals).toHaveLength(2);
    expect(withdrawals.map((message) => message.to)).toEqual(
      expect.arrayContaining([TOKEN_A, TOKEN_B]),
    );
    for (const message of withdrawals) expect(message.data).toMatchObject({ resolved: [read.id] });
    expect(withdrawals.find((message) => message.to === TOKEN_A)?.badge).toBe(1);
  });

  it('sends every resolved id in batches of at most 50', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    f.push.register(phone.device.id, { token: TOKEN_A, platform: 'ios' });
    const ids = Array.from({ length: 51 }, (_, index) => `approval:${index}`);
    for (const [index, id] of ids.entries()) {
      f.advance(1000);
      f.setInbox(ids.slice(0, index + 1).map((item) => approval(item, f.at(0))));
      await f.push.reconcile();
    }
    const before = f.expo.flat().length;
    f.setInbox([], 0);
    await f.push.reconcile();
    const batches = f.expo
      .flat()
      .slice(before)
      .map((message) => (message.data as { resolved?: string[] }).resolved ?? []);
    expect(batches.map((batch) => batch.length)).toEqual([50, 1]);
    expect(batches.flat().sort()).toEqual([...ids].sort());
  });

  it('tells an Android device that draws its own notifications which items were resolved, and an Android device the system draws only the badge', async () => {
    const f = fixture();
    const drawn = f.device('Drawn');
    const stock = f.device('Stock');
    f.push.register(drawn.device.id, { token: TOKEN_A, platform: 'android', render: 'app' });
    f.push.register(stock.device.id, { token: TOKEN_B, platform: 'android' });
    f.advance(1000);
    f.setInbox([approval('approval:1', f.at(0))]);
    await f.push.reconcile();
    const before = f.expo.flat().length;
    f.setInbox([], 0);
    await f.push.reconcile();
    const after = f.expo.flat().slice(before);
    expect(after).toContainEqual({
      to: TOKEN_A,
      priority: 'high',
      data: { v: 1, hostId: f.pairing.host().id, resolved: ['approval:1'] },
    });
    expect(after).toContainEqual({
      to: TOKEN_B,
      badge: 0,
      data: { v: 1, hostId: f.pairing.host().id },
    });
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

  it('holds replies while a desktop is active and sends the still-unread ones once it lapses', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    f.push.register(phone.device.id, { token: TOKEN_A, platform: 'ios' });
    f.advance(1000);
    const reply = (id: string): PushCandidate => ({
      id,
      kind: 'reply',
      attentionKind: 'channel-reply',
      botSlug: 'ada',
      createdAt: f.at(0),
      channelId: 'dm-ada',
    });
    const sent = () =>
      f.expo
        .flat()
        .map((message) => message.data.itemId)
        .filter((id) => id !== undefined);
    f.hold(true);
    f.setInbox([reply('reply:1'), reply('reply:2'), approval('approval:1', f.at(0))]);
    await f.push.reconcile();
    expect(sent()).toEqual(['approval:1']);
    f.setInbox([reply('reply:2'), approval('approval:1', f.at(0))]);
    await f.push.reconcile();
    expect(sent()).toEqual(['approval:1']);
    f.hold(false);
    await f.push.reconcile();
    expect(sent()).toEqual(['approval:1', 'reply:2']);
  });

  it('keeps an in-app-only device off push while still updating its badge', async () => {
    const f = fixture();
    const phone = f.device('Phone');
    f.push.register(phone.device.id, { token: TOKEN_A, platform: 'ios' });
    expect(f.push.setPreferences(phone.device.id, undefined, undefined, 'in-app')).toMatchObject({
      enabled: true,
      delivery: 'in-app',
    });
    f.advance(1000);
    f.setInbox([approval('approval:1', f.at(0))]);
    await f.push.reconcile();
    const sent = f.expo.flat();
    expect(sent.map((message) => message.data.itemId)).toEqual([undefined]);
    expect(sent[0]).toMatchObject({ to: TOKEN_A, badge: 1 });
    expect(f.push.setPreferences(phone.device.id, undefined, undefined, 'push')).toMatchObject({
      delivery: 'push',
    });
    f.setInbox([approval('approval:1', f.at(0)), approval('approval:2', f.at(0))]);
    await f.push.reconcile();
    expect(f.expo.flat().map((message) => message.data.itemId)).toEqual([undefined, 'approval:2']);
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

  it.each(['ticket', 'receipt'] as const)(
    'keeps a replacement token when the old token gets a delayed invalid %s',
    async (phase) => {
      const f = fixture();
      const phone = f.device('Phone');
      f.push.register(phone.device.id, { token: TOKEN_A, platform: 'android' });
      f.push.setPreferences(phone.device.id, { question: false });
      f.advance(1000);
      const first = approval('already-notified', f.at(0));
      f.setInbox([first]);
      await f.push.reconcile();
      const invalid = { status: 'error' as const, details: { error: 'DeviceNotRegistered' } };
      if (phase === 'ticket') {
        let settle!: (tickets: ExpoTicket[]) => void;
        const pending = new Promise<ExpoTicket[]>((resolve) => {
          settle = resolve;
        });
        vi.spyOn(f.expo.sender, 'send').mockImplementationOnce(() => pending);
        const sending = f.push.test(phone.device.id);
        f.push.register(phone.device.id, { token: TOKEN_B, platform: 'android' });
        expect(f.push.settings(phone.device.id)).toMatchObject({
          registered: true,
          preferences: { question: false },
        });
        settle([invalid]);
        expect(await sending).toBe('failed');
      } else {
        expect(await f.push.test(phone.device.id)).toBe('sent');
        f.push.register(phone.device.id, { token: TOKEN_B, platform: 'android' });
        expect(f.push.settings(phone.device.id)).toMatchObject({
          registered: true,
          preferences: { question: false },
        });
        f.expo.receipts['ticket-2'] = invalid;
        f.advance(15 * 60 * 1000);
        await f.push.checkReceipts();
      }
      expect(f.push.settings(phone.device.id)).toMatchObject({
        registered: true,
        preferences: { question: false },
      });
      expect(f.tokenRows()).toEqual([{ device_id: phone.device.id, token: TOKEN_B }]);
      expect(f.events.some((event) => event.phase === 'token-dropped')).toBe(false);
      f.setInbox([first, approval('new-after-rotation', f.at(0))]);
      await f.push.reconcile();
      expect(f.expo.flat().filter((message) => message.data.itemId)).toMatchObject([
        { to: TOKEN_A, data: { itemId: 'already-notified' } },
        { to: TOKEN_B, data: { itemId: 'new-after-rotation' } },
      ]);
      expect(JSON.stringify(f.events)).not.toContain(TOKEN_A);
      expect(JSON.stringify(f.events)).not.toContain(TOKEN_B);
    },
  );

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
          badge: 0,
        },
      }),
      expect.objectContaining({ to: TOKEN_B, title: 'New device paired', badge: 0 }),
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
