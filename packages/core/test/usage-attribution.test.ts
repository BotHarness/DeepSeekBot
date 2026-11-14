import { expect, it, vi } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import { createUsageProjection } from '../src/usage/usage.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const time = Date.parse('2026-11-14T12:00:00Z');
function fixture() {
  const home = createTempRoot('usage-attribution-');
  const mount = () =>
    trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
  const owner = mount();
  const db = attachOperationalModule(owner, 'attribution-test');
  const ownership = createSessionOwnership(db);
  db.transaction((connection) => {
    for (const human of ['alice', 'bob'])
      connection.prepare("INSERT INTO humans VALUES (?, ?, 'active', 'before')").run(human, human);
  });
  ownership.claim({
    sessionId: 'root',
    botSlug: 'bot',
    rootRole: 'orchestrator',
    at: new Date(time - 1).toISOString(),
  });
  const makeUsage = (database = owner) =>
    createUsageProjection({
      database,
      ownership: createSessionOwnership(attachOperationalModule(database, 'usage-ownership-test')),
      botOwner: () => 'local-human',
      now: () => new Date(time),
    });
  const usage = makeUsage();
  const rootTurn = (human: string, turn: number, at: number) => {
    db.transaction((connection) =>
      connection
        .prepare('INSERT OR REPLACE INTO usage_turn_humans VALUES (?, -1, ?, ?)')
        .run('root', human, at),
    );
    usage.handleSessionEvent('root', { type: 'turn/start', seq: turn, time: at, data: { turn } });
  };
  const child = (id: string, parent: string, at: number) =>
    ownership.claim({
      sessionId: id,
      botSlug: 'bot',
      rootRole: 'assignment',
      provenance: 'subagent',
      parentSessionId: parent,
      at: new Date(at).toISOString(),
    });
  const start = (id: string, turn: number, at: number) =>
    usage.handleSessionEvent(id, { type: 'turn/start', seq: turn * 2, time: at, data: { turn } });
  const receipt = (turn: number, at: number) => ({
    type: 'assistant/message',
    seq: turn * 2 + 1,
    time: at,
    data: {
      turn,
      message: { source: { provider: 'p', model: 'm' } },
      usage: {
        inputTokens: 10,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 10,
      },
    },
  });
  const totals = (projection = usage) =>
    Object.fromEntries(
      projection
        .byMember('today', 'local-human', (slug) => slug)
        .members.map((member) => [member.humanId, member.totals.totalTokens]),
    );
  return { owner, db, mount, makeUsage, usage, rootTurn, child, start, receipt, totals };
}

it.each([false, true])(
  'keeps descendants with the initiating parent when delayed start is %s, including restart/replay',
  async (delayed) => {
    const f = fixture();
    f.rootTurn('alice', 1, time);
    f.child('child', 'root', time + 1);
    f.usage.primeSession('child', []);
    if (!delayed) f.start('child', 1, time + 2);
    f.rootTurn('bob', 2, time + 3);
    if (delayed) f.start('child', 1, time + 4);
    f.child('grandchild', 'child', time + 5);
    f.start('grandchild', 1, time + 6);
    const event = f.receipt(1, time + 7);
    f.db.read((connection) => {
      const queries = vi.spyOn(connection, 'prepare');
      try {
        f.usage.handleSessionEvent('child', event);
        f.usage.handleSessionEvent('grandchild', event);
        expect(
          queries.mock.calls.filter(([sql]) => sql.includes('FROM usage_turn_humans')),
        ).toHaveLength(2);
      } finally {
        queries.mockRestore();
      }
    });
    expect(f.totals()).toEqual({ alice: 20 });
    f.owner.close();
    const restored = f.makeUsage(f.mount());
    await restored.rebuild(['grandchild', 'child'], async () => ({
      events: [event],
      inheritedEventCount: 0,
    }));
    expect(f.totals(restored)).toEqual({ alice: 20 });
  },
);

it('binds a later child activation to its new parent turn while retaining late receipts from its earlier turn', () => {
  const f = fixture();
  f.rootTurn('alice', 1, time);
  f.child('child', 'root', time + 1);
  f.start('child', 1, time + 2);
  f.rootTurn('bob', 2, time + 3);
  f.usage.bindParentTurn('child', 'root');
  f.start('child', 2, time + 4);
  f.usage.handleSessionEvent('child', f.receipt(1, time + 5));
  f.usage.handleSessionEvent('child', f.receipt(2, time + 6));
  expect(f.totals()).toEqual({ alice: 10, bob: 10 });
});
