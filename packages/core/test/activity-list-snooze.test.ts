import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import {
  createHumanAttentionDecisions,
  createHumanAttentionQuery,
} from '../src/runtime/human-attention.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTempRoot, createTestOwnership, trackTestOwner } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { createTestRosterStore } from './roster-fixture.js';

function fixture() {
  const home = createTempRoot('botharness-inbox-snooze-');
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const port = attachOperationalModule(owner, 'human-attention');
  let clock = Date.now();
  const now = () => new Date(clock);
  const channels = createSqliteChannelStore({
    database: port,
    databaseOwnerReady: owner.mode === 'ready',
    rootDir: join(home, 'channels'),
    now,
  });
  const query = createHumanAttentionQuery(port, undefined, undefined, undefined, undefined, now);
  const decisions = createHumanAttentionDecisions(port, now);
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now });
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
  return {
    channels,
    query,
    methods,
    dm,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const hour = 60 * 60 * 1000;

describe('Human Inbox snooze', () => {
  it('hides a snoozed item from the list and counts until its time, then brings it back', async () => {
    const f = fixture();
    for (const id of ['first', 'second'])
      await f.channels.appendMessage(f.dm.id, {
        id,
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: id,
        grantRequest: true,
      });
    const [item] = f.query.list({ category: 'action' }).items;
    const until = new Date(Date.now() + hour).toISOString();
    expect(
      f.methods.humanAttentionSnooze({ itemId: item!.id, sourceKey: item!.sourceEventId, until }),
    ).toEqual({ ok: true, value: { accepted: true } });
    expect(f.query.list({ category: 'action' }).items.map((row) => row.id)).not.toContain(item!.id);
    expect(f.query.actionCount()).toBe(1);
    expect(f.query.list({ category: 'action', snoozed: true }).items).toEqual([
      { ...item, snoozedUntil: until },
    ]);
    f.advance(2 * hour);
    expect(f.query.list({ category: 'action' }).items.map((row) => row.id)).toContain(item!.id);
    expect(f.query.list({ category: 'action', snoozed: true }).items).toEqual([]);
    expect(f.query.actionCount()).toBe(2);
  });

  it('brings an item back early and refuses bad times, foreign keys and unread items', async () => {
    const f = fixture();
    await f.channels.appendMessage(f.dm.id, {
      id: 'only',
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: 'ada' },
      body: 'only',
      grantRequest: true,
    });
    const [item] = f.query.list({ category: 'action' }).items;
    const snooze = (until: unknown, sourceKey: unknown = item!.sourceEventId) =>
      f.methods.humanAttentionSnooze({ itemId: item!.id, sourceKey, until });
    expect(snooze(new Date(Date.now() - hour).toISOString()).ok).toBe(false);
    expect(snooze(new Date(Date.now() + 31 * 24 * hour).toISOString()).ok).toBe(false);
    expect(snooze('tomorrow').ok).toBe(false);
    expect(snooze(new Date(Date.now() + hour).toISOString(), 'foreign').ok).toBe(false);
    expect(snooze(new Date(Date.now() + hour).toISOString()).ok).toBe(true);
    expect(f.query.list({ category: 'action' }).items).toEqual([]);
    expect(snooze(null)).toEqual({ ok: true, value: { accepted: true } });
    expect(f.query.list({ category: 'action' }).items.map((row) => row.id)).toEqual([item!.id]);
    expect(f.query.list({ category: 'unread', snoozed: true }).items).toEqual([]);
    expect(f.methods.humanAttention({ category: 'action', snoozed: 'yes' }).ok).toBe(false);
  });
});
