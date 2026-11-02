import { createTestRosterStore } from './roster-fixture.js';
import { createTestRegistry } from './registry-fixture.js';
import { createBridgeMethods } from '../src/bridge/methods.js';

import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTestOwnership } from './helpers.js';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import {
  createHumanAttentionDecisions,
  createHumanAttentionQuery,
} from '../src/runtime/human-attention.js';
import { FIXED_NOW, createTempRoot, trackTestOwner } from './helpers.js';

function fixture() {
  const home = createTempRoot('botharness-inbox-dismiss-');
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const port = attachOperationalModule(owner, 'human-attention');
  const channels = createSqliteChannelStore({
    database: port,
    databaseOwnerReady: owner.mode === 'ready',
    rootDir: join(home, 'channels'),
    now: FIXED_NOW,
  });
  const query = createHumanAttentionQuery(port);
  const decisions = createHumanAttentionDecisions(port, FIXED_NOW);
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  registry.create({ slug: 'ada', displayName: 'Ada' });
  const methods = createBridgeMethods({
    registry,
    channels,
    states: createBotStateTracker(),
    ownership: createTestOwnership(),
    roster: createTestRosterStore(),
    humanAttention: query,
    humanAttentionDecisions: decisions,
  });
  const dm = channels.getOrCreateDm('ada', 'Ada')!;
  return { home, owner, port, channels, query, decisions, dm, methods };
}

describe('Inbox-only dismissal', () => {
  it('persists a dismissed grant without authorizing it, hides before pagination, and admits a new request', async () => {
    const f = fixture();
    for (const id of ['first', 'second'])
      await f.channels.appendMessage(f.dm.id, {
        id,
        at: FIXED_NOW().toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: id,
        grantRequest: true,
      });
    const item = f.query.list({ category: 'action', limit: 1 }).items[0]!;
    expect(f.query.item(item.id)).toEqual(item);
    expect(f.methods.humanAttentionDismiss({ itemId: item.id, sourceKey: 'foreign' }).ok).toBe(
      false,
    );
    expect(
      f.methods.humanAttentionDismiss({ itemId: item.id, sourceKey: item.sourceEventId }),
    ).toEqual({ ok: true, value: { accepted: true } });
    expect(f.decisions.dismiss(item)).toBe(true);
    expect(f.query.list({ category: 'action', limit: 1 }).items).toHaveLength(1);
    expect(f.query.list({ category: 'action' }).items.some((row) => row.id === item.id)).toBe(
      false,
    );
    expect(f.query.actionCount()).toBe(1);
    expect(f.query.item(item.id)?.sourceEventId).toBe(item.sourceEventId);
    expect(f.channels.readMessages(f.dm.id).every((message) => message.author.kind === 'bot')).toBe(
      true,
    );
    expect(
      f.channels
        .readMessages(f.dm.id)
        .some((message) => message.grantRequestResolution !== undefined),
    ).toBe(false);
    f.owner.close();
    const reopened = trackTestOwner(
      mountOperationalDatabase({ dshHome: f.home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const query = createHumanAttentionQuery(attachOperationalModule(reopened, 'human-attention'));
    expect(query.list({ category: 'action' }).items.some((row) => row.id === item.id)).toBe(false);
  });

  it('dismisses the current unread batch without advancing read positions or hiding later arrivals', async () => {
    const f = fixture();
    for (const id of ['first', 'second'])
      await f.channels.appendMessage(f.dm.id, {
        id,
        at: FIXED_NOW().toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: id,
      });
    const item = f.query.list({ category: 'unread' }).items[0]!;
    expect(f.query.status().unreadCount).toBe(2);
    expect(f.decisions.dismiss(item)).toBe(true);
    expect(f.query.list({ category: 'unread' }).items).toEqual([]);
    expect(f.query.status().unreadCount).toBe(2);
    await f.channels.appendMessage(f.dm.id, {
      id: 'third',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'bot', slug: 'ada' },
      body: 'new arrival',
    });
    expect(f.query.list({ category: 'unread' }).items).toMatchObject([
      { messageId: 'third', unreadCount: 1 },
    ]);
    expect(f.query.status().unreadCount).toBe(3);
    expect(f.query.item(item.id)?.sourceEventId).not.toBe(item.sourceEventId);
    expect(
      f.methods.humanAttentionDismiss({ itemId: item.id, sourceKey: item.sourceEventId }).ok,
    ).toBe(true);
    expect(f.query.list({ category: 'unread' }).items).toHaveLength(1);
    const latest = f.query.list({ category: 'unread' }).items[0]!;
    await f.channels.markRead(f.dm.id, latest.messageId!);
    expect(
      f.methods.humanAttentionDismiss({ itemId: latest.id, sourceKey: latest.sourceEventId }).ok,
    ).toBe(true);
    expect(f.query.status().unreadCount).toBe(0);
    expect(f.methods.humanAttentionDismiss({ itemId: latest.id, sourceKey: 'foreign' }).ok).toBe(
      false,
    );
  });

  it('lists dismissed items on their own and restores one to its category', async () => {
    const f = fixture();
    await f.channels.appendMessage(f.dm.id, {
      id: 'grant',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'bot', slug: 'ada' },
      body: 'grant',
      grantRequest: true,
    });
    const item = f.query.list({ category: 'action' }).items[0]!;
    expect(f.query.list({ category: 'action', dismissed: true }).items).toEqual([]);
    expect(
      f.methods.humanAttentionRestore({ itemId: item.id, sourceKey: item.sourceEventId }).ok,
    ).toBe(false);
    expect(f.decisions.dismiss(item)).toBe(true);
    expect(f.methods.humanAttention({ category: 'action', dismissed: true })).toEqual({
      ok: true,
      value: { items: [item], dismissed: true },
    });
    expect(f.methods.humanAttentionRestore({ itemId: item.id, sourceKey: 'foreign' }).ok).toBe(
      false,
    );
    expect(
      f.methods.humanAttentionRestore({ itemId: item.id, sourceKey: item.sourceEventId }),
    ).toEqual({ ok: true, value: { accepted: true } });
    expect(f.query.list({ category: 'action' }).items).toEqual([item]);
    expect(f.query.list({ category: 'action', dismissed: true }).items).toEqual([]);
    expect(f.methods.humanAttention({ dismissed: true, snoozed: true }).ok).toBe(false);
    expect(f.methods.humanAttention({ dismissed: 'yes' }).ok).toBe(false);
  });

  it('restores a dismissed unread conversation, including batches cleared earlier', async () => {
    const f = fixture();
    const send = (id: string) =>
      f.channels.appendMessage(f.dm.id, {
        id,
        at: FIXED_NOW().toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: id,
      });
    await send('first');
    expect(f.decisions.dismiss(f.query.list({ category: 'unread' }).items[0]!)).toBe(true);
    await send('second');
    expect(f.decisions.dismiss(f.query.list({ category: 'unread' }).items[0]!)).toBe(true);
    expect(f.query.list({ category: 'unread' }).items).toEqual([]);
    const cleared = f.query.list({ category: 'unread', dismissed: true }).items;
    expect(cleared).toMatchObject([{ messageId: 'second', unreadCount: 2 }]);
    expect(
      f.methods.humanAttentionRestore({
        itemId: cleared[0]!.id,
        sourceKey: cleared[0]!.sourceEventId,
      }).ok,
    ).toBe(true);
    expect(f.query.list({ category: 'unread' }).items).toMatchObject([
      { messageId: 'second', unreadCount: 2 },
    ]);
    expect(f.query.list({ category: 'unread', dismissed: true }).items).toEqual([]);
  });
});
