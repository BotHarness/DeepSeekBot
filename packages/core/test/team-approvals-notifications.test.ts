import { createPushDelivery, type ExpoMessage } from '../src/push/delivery.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { activityListPushSource } from '../src/push/source.js';
import { alice, bob, admin, fixture, seed, masked, cleanup } from './team-approvals-fixtures.js';

afterEach(cleanup);

describe('M5 approval projections and decisions', () => {
  it.each(['tool', 'question', 'secret'] as const)(
    'retains M4 Human DM access and masks %s cards',
    async (kind) => {
      const f = fixture();
      const dm = f.team.channelAccess.dm(alice, bob.humanId).channel;
      const request = await seed(f, kind, 'alice-bot', dm.id);
      const project = vi.spyOn(f.team.approvals, 'project');
      expect(await f.invoke(bob, 'channelGet', { channelId: dm.id })).toMatchObject({
        channel: { id: dm.id },
      });
      expect(project).toHaveBeenCalled();
      for (const method of ['channelMessages', 'channelTimeline'])
        masked(await f.invoke(bob, method, { channelId: dm.id }), request.id);
      const method =
        kind === 'tool'
          ? 'toolApprovalStatus'
          : kind === 'question'
            ? 'userQuestionStatus'
            : 'privateInputStatus';
      masked(await f.invoke(bob, method, { channelId: dm.id, messageId: request.id }));
      masked(f.attention.list(bob, { category: 'action' }), request.id);
      for (const outsider of [owner, admin])
        await expect(
          f.invoke(outsider, 'channelMessages', { channelId: dm.id }),
        ).rejects.toMatchObject({
          code: expect.stringMatching(/channel-not-found|remote-access\/denied/),
        });
      if (kind !== 'tool')
        expect(f.team.approvals.card(alice, dm.id, request)).toMatchObject({ masked: false });
    },
  );

  it('sends only masked push payloads and deduplicates delivery', async () => {
    const f = fixture();
    const pairing = createDevicePairing({ database: f.database, hostName: 'M5' });
    const sent: ExpoMessage[] = [];
    const delivery = createPushDelivery({
      database: f.database,
      source: activityListPushSource(
        f.attention,
        (slug) => slug,
        (channel, id) => f.channels.message(channel, id)?.toolApprovalRequest,
      ),
      sender: {
        async send(messages) {
          sent.push(...messages);
          return messages.map((_, i) => ({ status: 'ok' as const, id: 'ticket-' + i }));
        },
        async receipts() {
          return {};
        },
      },
      host: () => pairing.host(),
      deviceActive: () => true,
      deviceHuman: (id) => (id === 'missing' ? undefined : bob),
    });
    const paired = pairing.redeem({ offer: pairing.createOffer().offer, name: 'Bob' });
    if (!paired.ok) throw new Error('test-pairing-failed');
    delivery.register(paired.device.id, {
      token: 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]',
      platform: 'ios',
    });
    const request = await seed(f, 'tool');
    f.registry.update('alice-bot', { displayName: 'Planner' });
    await delivery.reconcile();
    await delivery.reconcile();
    expect(sent.filter((message) => message.data.itemId)).toHaveLength(1);
    masked(sent);
    expect(sent[0]?.data).toMatchObject({
      messageId: request.id,
      approval: { masked: true },
      sender: 'Planner',
      author: { kind: 'bot', slug: 'alice-bot', displayName: 'Planner' },
    });
    expect(sent[0]?.categoryId).toBeUndefined();
  });

  it('routes unattended requests to the Bot owner once and removes that fallback when an approver joins', async () => {
    const f = fixture();
    await seed(f, 'question');
    f.database.transaction((db) =>
      db
        .prepare(
          "UPDATE channel_human_members SET left_at='now' WHERE channel_id=? AND human_id IN ('alice','local-human')",
        )
        .run(f.group.id),
    );
    expect(f.attention.list(alice, { category: 'action' }).items).toHaveLength(1);
    const source = activityListPushSource(f.attention, (slug) => slug);
    expect(source.pending(alice).items).toHaveLength(1);
    expect(source.pending(alice).items).toHaveLength(1);
    f.database.transaction((db) =>
      db
        .prepare(`INSERT INTO channel_human_members(channel_id, human_id, display_name, visible_from_revision, joined_at)
      VALUES (?, 'admin', 'Admin', 0, ?)`)
        .run(f.group.id, new Date().toISOString()),
    );
    expect(f.attention.list(alice, { category: 'action' }).items).toHaveLength(0);
    expect(f.attention.list(admin, { category: 'action' }).items).toHaveLength(1);
    f.database.transaction((db) =>
      db.prepare("UPDATE humans SET status = 'suspended' WHERE human_id = 'admin'").run(),
    );
    expect(f.attention.list(alice, { category: 'action' }).items).toHaveLength(1);
  });
});
