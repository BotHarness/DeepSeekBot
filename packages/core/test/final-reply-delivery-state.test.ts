import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createChannelStore, type ChannelStore } from '../src/channels/store.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseModulePort,
  type OperationalDatabaseOwner,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createInboxTriage, type InboxTriage } from '../src/runtime/inbox-triage.js';
import { createTempRoot } from './helpers.js';

const NOW = (): Date => new Date('2026-10-21T00:00:00.000Z');
const AT = NOW().toISOString();

interface Mounted {
  owner: OperationalDatabaseOwner;
  channels: ChannelStore;
  database: OperationalDatabaseModulePort;
  dmId: string;
  triage: InboxTriage;
}

function mount(home: string): Mounted {
  const owner = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    now: NOW,
  });
  const channels = createChannelStore({ rootDir: join(home, 'channels'), now: NOW });
  const dm = channels.getOrCreateDm('ada', 'Ada');
  if (dm === undefined) throw new Error('Missing DM');
  const database = attachOperationalModule(owner, 'final-reply-delivery-test');
  return {
    owner,
    channels,
    database,
    dmId: dm.id,
    triage: createInboxTriage(database, channels, NOW),
  };
}

function access(mounted: Mounted) {
  return mounted.triage.access({
    botSlug: 'ada',
    sessionId: 'final-reply-delivery-session',
    current: () => [],
    changed: () => {},
    snoozed: () => {},
  });
}

let sequence = 0;

function seed(
  mounted: Mounted,
  input: { body?: string; botSlug?: string; channelId?: string } = {},
): string {
  sequence += 1;
  const sourceId = `source-${sequence}`;
  const botSlug = input.botSlug ?? 'ada';
  const channelId = input.channelId ?? mounted.dmId;
  const at = new Date(Date.parse(AT) + sequence * 1000).toISOString();
  mounted.database.transaction(
    (db) => {
      db.prepare(`
        INSERT INTO source_events
          (source_event_id, source_kind, bot_slug, channel_id, message_id, body, created_at,
           handled_at, attempt_state, observed_at)
        VALUES (?, 'human-message', ?, ?, ?, ?, ?, ?, 'handled', ?)
      `).run(sourceId, botSlug, channelId, `message-${sequence}`, input.body ?? 'Body', at, at, at);
      db.prepare(`
        INSERT INTO inbox_admissions
          (source_event_id, bot_slug, reason, attempt_state, observed_at, opened_at)
        VALUES (?, ?, 'human-dm', 'handled', ?, ?)
      `).run(sourceId, botSlug, at, at);
    },
    ['bot-inbox'],
  );
  return sourceId;
}

interface FinalRow {
  final_reply_json: string | null;
  resolved_at: string | null;
  resolution: string | null;
  opened_at: string | null;
  attempt_state: string;
}

function expectRecordFailure(run: () => unknown, message: RegExp): void {
  let failure: unknown;
  try {
    run();
  } catch (error) {
    failure = error;
  }
  if (!(failure instanceof Error)) throw new Error('Expected recordFinal to fail');
  expect(failure.cause instanceof Error ? failure.cause.message : failure.message).toMatch(message);
}

function finalRow(mounted: Mounted, sourceId: string, botSlug = 'ada'): FinalRow {
  const row = mounted.database.read(
    (db) =>
      db
        .prepare(`
          SELECT final_reply_json, resolved_at, resolution, opened_at, attempt_state
            FROM inbox_admissions
           WHERE bot_slug = ? AND source_event_id = ?
        `)
        .get(botSlug, sourceId) as FinalRow | undefined,
  );
  if (row === undefined) throw new Error(`Missing admission ${sourceId}`);
  return row;
}

describe('Host final-reply delivery state on the canonical Inbox', () => {
  it('keeps per-Source decisions visible in inbox_list and [Open Inbox] across restart', () => {
    const home = createTempRoot('botharness-final-delivery-');
    let mounted = mount(home);
    let accepted = '';
    let refused = '';
    let pending = '';
    try {
      expect(mounted.owner.generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
      const columns = mounted.database.read(
        (db) =>
          db.prepare('PRAGMA table_info(inbox_admissions)').all() as unknown as Array<{
            name: string;
            type: string;
          }>,
      );
      expect(columns.find((column) => column.name === 'final_reply_json')).toMatchObject({
        type: 'TEXT',
      });

      accepted = seed(mounted, { body: 'Accepted private body' });
      refused = seed(mounted, { body: 'Refused private body' });
      pending = seed(mounted, { body: 'Never attempted private body' });

      expect(
        mounted.triage.recordFinal('ada', accepted, {
          status: 'accepted',
          receipt: 'outbox-intent-accepted',
          complete: true,
        }),
      ).toEqual({
        status: 'accepted',
        receipt: 'outbox-intent-accepted',
        complete: true,
        at: AT,
      });
      expect(
        mounted.triage.recordFinal('ada', refused, {
          status: 'refused',
          reason: 'explicit-send-attempt',
        }),
      ).toEqual({ status: 'refused', reason: 'explicit-send-attempt', at: AT });

      const page = access(mounted).list();
      expect(page.total).toBe(3);
      expect(page.groups).toHaveLength(1);
      expect(page.groups[0]!.finalDeliveries).toEqual([
        { id: pending, status: 'pending' },
        { id: refused, status: 'refused', reason: 'explicit-send-attempt', at: AT },
        {
          id: accepted,
          status: 'accepted',
          receipt: 'outbox-intent-accepted',
          complete: true,
          at: AT,
        },
      ]);
      expect(page.groups[0]!.ids).toEqual([pending, refused, accepted]);

      const summary = mounted.triage.openSummary('ada');
      expect(summary).toContain(
        `final delivery: pending ${pending}, refused ${refused} (explicit-send-attempt), +1 more`,
      );
      expect(summary).toContain('pending means none was recorded');
    } finally {
      mounted.owner.close();
    }

    mounted = mount(home);
    try {
      const page = access(mounted).list({ includeSnoozed: true });
      expect(page.groups[0]!.finalDeliveries).toEqual([
        { id: pending, status: 'pending' },
        { id: refused, status: 'refused', reason: 'explicit-send-attempt', at: AT },
        {
          id: accepted,
          status: 'accepted',
          receipt: 'outbox-intent-accepted',
          complete: true,
          at: AT,
        },
      ]);
      const summary = mounted.triage.openSummary('ada');
      expect(summary).toContain(`refused ${refused} (explicit-send-attempt)`);
      expect(summary).toContain('+1 more');
    } finally {
      mounted.owner.close();
    }
  });

  it('upgrades a populated generation-104 database without losing the admission', () => {
    const home = createTempRoot('botharness-final-delivery-upgrade-');
    const sourceId = 'legacy-source';
    const legacyPlan = defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 104),
    );
    const legacy = mountOperationalDatabase({ dshHome: home, schemaPlan: legacyPlan, now: NOW });
    try {
      expect(legacy.generation).toBe(104);
      const database = attachOperationalModule(legacy, 'final-delivery-legacy');
      database.transaction(
        (db) => {
          db.prepare(`
            INSERT INTO source_events
              (source_event_id, source_kind, bot_slug, body, created_at, handled_at,
               attempt_state, observed_at)
            VALUES (?, 'human-message', 'ada', ?, ?, ?, 'handled', ?)
          `).run(sourceId, 'Populated before generation 105', AT, AT, AT);
          db.prepare(`
            INSERT INTO inbox_admissions
              (source_event_id, bot_slug, reason, attempt_state, observed_at, opened_at)
            VALUES (?, 'ada', 'human-dm', 'handled', ?, ?)
          `).run(sourceId, AT, AT);
        },
        ['bot-inbox'],
      );
      expect(
        database.read(
          (db) =>
            db
              .prepare(
                'SELECT opened_at, resolution_note FROM inbox_admissions WHERE source_event_id = ?',
              )
              .get(sourceId) as { opened_at: string; resolution_note: string | null } | undefined,
        ),
      ).toMatchObject({ opened_at: AT, resolution_note: null });
    } finally {
      legacy.close();
    }

    const upgraded = mount(home);
    try {
      expect(upgraded.owner.generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
      expect(finalRow(upgraded, sourceId)).toMatchObject({
        final_reply_json: null,
        resolved_at: null,
        resolution: null,
        opened_at: AT,
        attempt_state: 'handled',
      });
      const page = access(upgraded).list();
      expect(page.total).toBe(1);
      expect(page.groups[0]!.finalDeliveries).toEqual([{ id: sourceId, status: 'pending' }]);
      expect(upgraded.triage.openSummary('ada')).toContain(`final delivery: pending ${sourceId}`);

      expect(() =>
        upgraded.database.transaction((db) =>
          db
            .prepare('UPDATE inbox_admissions SET final_reply_json = ? WHERE source_event_id = ?')
            .run('not-json', sourceId),
        ),
      ).toThrow();
      expect(finalRow(upgraded, sourceId).final_reply_json).toBeNull();

      upgraded.triage.recordFinal('ada', sourceId, {
        status: 'refused',
        reason: 'post-upgrade',
      });
      expect(JSON.parse(finalRow(upgraded, sourceId).final_reply_json!)).toMatchObject({
        status: 'refused',
        reason: 'post-upgrade',
      });
    } finally {
      upgraded.owner.close();
    }
  });

  it('stores bounded metadata without message body and never masks an accepted record', () => {
    const mounted = mount(createTempRoot('botharness-final-delivery-metadata-'));
    try {
      const sourceId = seed(mounted, { body: 'Body that must never enter delivery state' });
      expect(finalRow(mounted, sourceId).final_reply_json).toBeNull();
      expectRecordFailure(
        () =>
          mounted.triage.recordFinal('ada', sourceId, {
            status: 'not-accepted',
            reason: 'x'.repeat(241),
          }),
        /reason must be 1–240/,
      );
      expectRecordFailure(
        () =>
          mounted.triage.recordFinal('ada', sourceId, {
            status: 'not-accepted',
            receipt: 'x'.repeat(201),
          }),
        /receipt must be 1–200/,
      );
      expectRecordFailure(
        () =>
          mounted.triage.recordFinal('bea', sourceId, { status: 'refused', reason: 'wrong-bot' }),
        /no admission/,
      );
      expectRecordFailure(
        () => mounted.triage.recordFinal('ada', 'missing-source', { status: 'refused' }),
        /no admission/,
      );
      expect(() =>
        mounted.database.transaction((db) =>
          db
            .prepare('UPDATE inbox_admissions SET final_reply_json = ? WHERE source_event_id = ?')
            .run('not-json', sourceId),
        ),
      ).toThrow();
      expect(finalRow(mounted, sourceId).final_reply_json).toBeNull();

      const withBody = {
        status: 'accepted' as const,
        receipt: 'outbox-intent-metadata',
        body: 'Body that must never enter delivery state',
      };
      mounted.triage.recordFinal('ada', sourceId, withBody);

      const stored = finalRow(mounted, sourceId).final_reply_json;
      expect(stored).not.toBeNull();
      const metadata = JSON.parse(stored!) as Record<string, unknown>;
      expect(Object.keys(metadata).sort()).toEqual(['at', 'receipt', 'status']);
      expect(JSON.stringify(metadata)).not.toContain('Body that must never');
      expect(metadata).toMatchObject({
        status: 'accepted',
        receipt: 'outbox-intent-metadata',
        at: AT,
      });

      const masked = mounted.triage.recordFinal('ada', sourceId, {
        status: 'not-accepted',
        reason: 'unknown-outcome',
      });
      expect(masked).toMatchObject({ status: 'accepted', receipt: 'outbox-intent-metadata' });
      expect(JSON.parse(finalRow(mounted, sourceId).final_reply_json!)).toMatchObject({
        status: 'accepted',
        receipt: 'outbox-intent-metadata',
      });
      expect(
        mounted.triage.recordFinal('ada', sourceId, {
          status: 'refused',
          reason: 'source-not-unique-or-inactive',
        }),
      ).toMatchObject({ status: 'accepted' });
    } finally {
      mounted.owner.close();
    }
  });

  it('keeps receipt-bearing not-accepted evidence when a later receipt-less refusal arrives', () => {
    const mounted = mount(createTempRoot('botharness-final-delivery-evidence-'));
    try {
      const sourceId = seed(mounted);
      mounted.triage.recordFinal('ada', sourceId, {
        status: 'not-accepted',
        reason: 'unknown-outcome',
        receipt: 'outbox-intent-unknown',
      });
      const kept = mounted.triage.recordFinal('ada', sourceId, {
        status: 'refused',
        reason: 'explicit-send-attempt',
      });
      expect(kept).toMatchObject({
        status: 'not-accepted',
        reason: 'unknown-outcome',
        receipt: 'outbox-intent-unknown',
      });
      expect(JSON.parse(finalRow(mounted, sourceId).final_reply_json!)).toMatchObject({
        status: 'not-accepted',
        reason: 'unknown-outcome',
        receipt: 'outbox-intent-unknown',
      });
      expect(access(mounted).list().groups[0]!.finalDeliveries[0]).toMatchObject({
        status: 'not-accepted',
        reason: 'unknown-outcome',
        receipt: 'outbox-intent-unknown',
      });
      expect(mounted.triage.openSummary('ada')).toContain(
        `not-accepted ${sourceId} (unknown-outcome)`,
      );

      mounted.triage.recordFinal('ada', sourceId, {
        status: 'accepted',
        receipt: 'outbox-intent-accepted',
        complete: true,
      });
      expect(JSON.parse(finalRow(mounted, sourceId).final_reply_json!)).toMatchObject({
        status: 'accepted',
        receipt: 'outbox-intent-accepted',
      });
      expect(
        mounted.triage.recordFinal('ada', sourceId, {
          status: 'refused',
          reason: 'explicit-send-attempt',
        }),
      ).toMatchObject({ status: 'accepted', receipt: 'outbox-intent-accepted' });

      const other = seed(mounted);
      mounted.triage.recordFinal('ada', other, {
        status: 'not-accepted',
        reason: 'send-error-inspect-delivery',
      });
      mounted.triage.recordFinal('ada', other, {
        status: 'refused',
        reason: 'explicit-send-attempt',
      });
      expect(JSON.parse(finalRow(mounted, other).final_reply_json!)).toMatchObject({
        status: 'refused',
        reason: 'explicit-send-attempt',
      });
    } finally {
      mounted.owner.close();
    }
  });

  it('records a later outcome without reopening a resolved admission', () => {
    const mounted = mount(createTempRoot('botharness-final-delivery-resolved-'));
    try {
      const sourceId = seed(mounted);
      mounted.triage.recordFinal('ada', sourceId, {
        status: 'not-accepted',
        reason: 'unknown-outcome',
        receipt: 'outbox-intent-unknown',
      });
      const before = access(mounted).list();
      expect(before.groups[0]!.finalDeliveries[0]).toMatchObject({
        status: 'not-accepted',
        reason: 'unknown-outcome',
        receipt: 'outbox-intent-unknown',
      });

      expect(access(mounted).resolve({ ids: [sourceId], outcome: 'done' })).toEqual({
        outcome: 'resolved',
        resolved: [sourceId],
        alreadyResolved: [],
      });
      const resolved = finalRow(mounted, sourceId);
      expect(resolved.resolution).toBe('done');
      expect(resolved.resolved_at).not.toBeNull();

      mounted.triage.recordFinal('ada', sourceId, {
        status: 'accepted',
        receipt: 'outbox-intent-late',
        complete: true,
      });
      const after = finalRow(mounted, sourceId);
      expect(after).toMatchObject({
        resolution: 'done',
        resolved_at: resolved.resolved_at,
        opened_at: resolved.opened_at,
        attempt_state: 'handled',
      });
      expect(JSON.parse(after.final_reply_json!)).toMatchObject({
        status: 'accepted',
        receipt: 'outbox-intent-late',
        complete: true,
      });
      expect(access(mounted).list().total).toBe(0);
      expect(access(mounted).current()).toEqual([]);
      expect(mounted.triage.openIds('ada')).toEqual([]);
      expect(mounted.triage.openSummary('ada')).toBe('');
    } finally {
      mounted.owner.close();
    }
  });

  it('does not expose the owner-only writer through Orchestrator inbox access', () => {
    const mounted = mount(createTempRoot('botharness-final-delivery-surface-'));
    try {
      const orchestrator = access(mounted);
      expect(Object.keys(orchestrator).sort()).toEqual(['current', 'list', 'resolve', 'snooze']);
      expect('recordFinal' in orchestrator).toBe(false);
      expect(typeof mounted.triage.recordFinal).toBe('function');
    } finally {
      mounted.owner.close();
    }
  });
});
