import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { humanContext, OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { resolveInvocationHuman } from '../src/bridge/rpc.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import {
  createHumanAttentionDecisions,
  createHumanAttentionQuery,
} from '../src/runtime/human-attention.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

function fixture() {
  const home = createTempRoot('human-context-isolation-');
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const database = attachOperationalModule(owner, 'human-attention');
  const now = () => new Date('2026-11-14T00:00:00.000Z');
  const channels = createSqliteChannelStore({ database, rootDir: join(home, 'channels'), now });
  const query = createHumanAttentionQuery(
    database,
    undefined,
    undefined,
    undefined,
    undefined,
    now,
  );
  const decisions = createHumanAttentionDecisions(database, now);
  return { database, channels, query, decisions };
}

describe('explicit Human context', () => {
  it('validates identity and resolves only trusted Owner invocations', () => {
    expect(() => humanContext('')).toThrow();
    expect(() => humanContext('   ')).toThrow();
    expect(Object.isFrozen(humanContext('human-test-b'))).toBe(true);
    const peer = {};
    expect(resolveInvocationHuman(peer, { operator: peer })).toBe(OWNER_HUMAN_CONTEXT);
    expect(resolveInvocationHuman({ principal: { kind: 'owner' } }, undefined)).toBe(
      OWNER_HUMAN_CONTEXT,
    );
    expect(
      resolveInvocationHuman({ principal: { kind: 'guest' } }, { operator: peer }),
    ).toBeUndefined();
    expect(resolveInvocationHuman(undefined, undefined)).toBeUndefined();
    expect(
      resolveInvocationHuman({ humanId: OWNER_HUMAN_CONTEXT.humanId }, undefined),
    ).toBeUndefined();
  });

  it('keeps read positions, Activity unread, snoozes and dismissals separate in SQLite', async () => {
    const { database, channels, query, decisions } = fixture();
    const a = OWNER_HUMAN_CONTEXT;
    const b = humanContext("human-test-b'--");
    const group = channels.createGroup(a, { name: 'Shared', members: ['ada'] });
    database.transaction(
      (db) => {
        db.prepare(`INSERT INTO channel_human_members
        (channel_id, human_id, display_name, visible_from_revision, joined_at)
        VALUES (?, ?, 'Second Human', 1, ?)`).run(group.id, b.humanId, group.createdAt);
      },
      ['channel'],
    );
    await channels.appendMessage(a, group.id, {
      id: 'message',
      at: group.createdAt,
      author: { kind: 'bot', slug: 'ada' },
      body: 'Ready',
    });
    expect(query.status(a).unreadCount).toBe(1);
    expect(query.status(b).unreadCount).toBe(1);
    const unread = query.list(b, { category: 'unread' }).items[0]!;
    expect(decisions.dismiss(b, unread)).toBe(true);
    expect(query.list(b, { category: 'unread' }).items).toEqual([]);
    expect(query.list(a, { category: 'unread' }).items).toHaveLength(1);
    expect(decisions.restore(a, unread)).toBe(false);
    expect(decisions.restore(b, unread)).toBe(true);
    await channels.markRead(a, group.id, 'message');
    expect(channels.readPosition(a, group.id)?.messageId).toBe('message');
    expect(channels.readPosition(b, group.id)).toBeUndefined();
    expect(query.status(a).unreadCount).toBe(0);
    expect(query.status(b).unreadCount).toBe(1);
    expect(query.unreadByChannel(a)).toEqual([]);
    expect(query.unreadByChannel(b)).toEqual([{ channelId: group.id, unreadCount: 1 }]);
    const dm = channels.getOrCreateDm(a, 'ada', 'Ada')!;
    await channels.appendMessage(a, dm.id, {
      id: 'grant',
      at: group.createdAt,
      author: { kind: 'bot', slug: 'ada' },
      body: 'Grant',
      grantRequest: true,
    });
    const action = query.list(a, { category: 'action' }).items[0]!;
    expect(action).toBeDefined();
    expect(decisions.snooze(a, action, '2026-11-14T01:00:00.000Z')).toBe(true);
    expect(query.list(a, { category: 'action' }).items).toEqual([]);
    expect(query.list(a, { category: 'action', snoozed: true }).items).toHaveLength(1);
    expect(query.list(b, { category: 'action', snoozed: true }).items).toEqual([]);
    expect(query.list(b, { category: 'action' }).items).toEqual([]);
    expect(query.actionCount(a)).toBe(0);
    expect(query.actionCount(b)).toBe(0);
    expect(decisions.dismiss(a, action)).toBe(true);
    expect(query.list(b, { category: 'action', dismissed: true }).items).toEqual([]);
    expect(query.list(a, { category: 'action', dismissed: true }).items).toHaveLength(1);
    expect(decisions.restore(a, action)).toBe(true);
    expect(decisions.snooze(a, action, null)).toBe(true);
    expect(query.list(a, { category: 'action' }).items).toHaveLength(1);
  });

  it('refuses another Human’s private Assignment report', () => {
    const { database, query, decisions } = fixture();
    const second = humanContext('human-test-b');
    database.transaction(
      (db) => {
        db.prepare(`INSERT INTO session_ownership(session_id, bot_slug, root_role, created_at)
        VALUES ('assignment', 'ada', 'assignment', '2026-11-14T00:00:00.000Z')`).run();
        db.prepare(`INSERT INTO source_events(source_event_id, source_kind, bot_slug, assignment_session_id, body, created_at)
        VALUES ('report', 'assignment-report', 'ada', 'assignment', 'Completed', '2026-11-14T00:00:00.000Z')`).run();
        db.prepare(`INSERT INTO assignments(session_id, source_event_id, bot_slug, description, activity,
        latest_report_state, latest_report_summary, latest_report_at, created_at, updated_at)
        VALUES ('assignment', 'report', 'ada', 'Verify', 'idle', 'completed', 'Completed',
        '2026-11-14T00:00:00.000Z', '2026-11-14T00:00:00.000Z', '2026-11-14T00:00:00.000Z')`).run();
      },
      ['source-event'],
    );
    expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'info' }).items).toHaveLength(1);
    expect(query.list(second, { category: 'info' }).items).toEqual([]);
    expect(decisions.ignoreAssignmentReport(second, 'report')).toBe(false);
    expect(query.list(second, { category: 'info' }).items).toEqual([]);
    expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'info' }).items).toHaveLength(1);
  });

  it('records the speaking Human separately from the unchanged message JSON', async () => {
    const { database, channels } = fixture();
    const human = humanContext('human-test-b');
    const group = channels.createGroup(human, { name: 'Second Human', members: [] });
    await channels.appendMessage(human, group.id, {
      id: 'spoken',
      at: group.createdAt,
      author: { kind: 'human' },
      body: 'Hello',
    });
    expect(channels.listHumanMembers(human, group.id).map((member) => member.humanId)).toEqual([
      human.humanId,
    ]);
    const row = database.read((db) =>
      db
        .prepare('SELECT human_id, payload_json FROM source_events WHERE message_id = ?')
        .get('spoken'),
    )!;
    expect(row.human_id).toBe(human.humanId);
    expect(JSON.parse(String(row.payload_json)).author).toEqual({ kind: 'human' });
  });
  it('upgrades existing Human Source Events and ignored reports as Owner state', () => {
    const home = createTempRoot('human-context-upgrade-');
    const previous = trackTestOwner(
      mountOperationalDatabase({
        dshHome: home,
        schemaPlan: defineSchemaPlan(
          BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation < 140),
        ),
      }),
    );
    attachOperationalModule(previous, 'human-attention').transaction((db) => {
      db.prepare(`INSERT INTO source_events(source_event_id, source_kind, bot_slug, body, created_at)
        VALUES (?, ?, 'ada', 'Existing', '2026-11-14T00:00:00.000Z')`).run(
        'human',
        'human-message',
      );
      db.prepare(`INSERT INTO source_events(source_event_id, source_kind, bot_slug, body, created_at)
        VALUES (?, ?, 'ada', 'Existing', '2026-11-14T00:00:00.000Z')`).run(
        'report',
        'assignment-report',
      );
      db.prepare(`INSERT INTO session_ownership(session_id, bot_slug, root_role, created_at)
        VALUES ('assignment', 'ada', 'assignment', '2026-11-14T00:00:00.000Z')`).run();
      db.prepare(
        "UPDATE source_events SET assignment_session_id = 'assignment' WHERE source_event_id = 'report'",
      ).run();
      db.prepare(`INSERT INTO assignments(session_id, source_event_id, bot_slug, description, activity,
        latest_report_state, latest_report_summary, latest_report_at, created_at, updated_at)
        VALUES ('assignment', 'report', 'ada', 'Verify', 'idle', 'completed', 'Existing',
        '2026-11-14T00:00:00.000Z', '2026-11-14T00:00:00.000Z', '2026-11-14T00:00:00.000Z')`).run();
      db.prepare(`INSERT INTO human_attention_decisions(source_event_id, decision, decided_at)
        VALUES ('report', 'ignored', '2026-11-14T00:00:00.000Z')`).run();
    });
    previous.close();
    const upgraded = trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    expect(upgraded.mode).toBe('ready');
    const database = attachOperationalModule(upgraded, 'human-attention');
    expect(
      database.read((db) =>
        db.prepare('SELECT human_id FROM source_events WHERE source_event_id = ?').get('human'),
      )?.human_id,
    ).toBe(OWNER_HUMAN_CONTEXT.humanId);
    expect(
      database.read((db) =>
        db.prepare('SELECT human_id FROM source_events WHERE source_event_id = ?').get('report'),
      )?.human_id,
    ).toBeNull();
    expect(
      database.read((db) =>
        db
          .prepare('SELECT human_id FROM human_attention_decisions WHERE source_event_id = ?')
          .get('report'),
      )?.human_id,
    ).toBe(OWNER_HUMAN_CONTEXT.humanId);
    const decisions = createHumanAttentionDecisions(database);
    expect(decisions.ignoreAssignmentReport(humanContext('human-test-b'), 'report')).toBe(false);
    expect(
      database.read((db) =>
        db
          .prepare('SELECT human_id FROM human_attention_decisions WHERE source_event_id = ?')
          .all('report'),
      ),
    ).toHaveLength(1);
  });
});
