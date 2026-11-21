import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { isChannelMessage, isChannelRecord, type ChannelMessage } from '../channels/channel.js';
import type { attachOperationalModule } from '../database/owner.js';
import type { HumanContext } from '../humans/context.js';
import {
  ContentPurgeError,
  type PurgePreview,
  TEXT_CLEANUP_LIMIT,
  type TextCleanupKeptReason,
  type TextCleanupScope,
} from './contracts.js';
import type { openPurgeLedger } from './ledger.js';
import type { mountContentPurge } from './owner.js';
import { managedSourceFiles, retainedManagedFiles } from './references.js';

export interface SourceRow {
  source_event_id: string;
  channel_id: string;
  message_id: string;
  source_kind: string;
  body: string;
  created_at: string;
  payload_json: string;
  position?: number;
}
export const zSourceRows = (rows: unknown) =>
  z
    .array(
      z.object({
        source_event_id: z.string(),
        channel_id: z.string(),
        message_id: z.string(),
        source_kind: z.string(),
        body: z.string(),
        created_at: z.string(),
        payload_json: z.string(),
      }),
    )
    .parse(rows);
export const unsupported = () =>
  new ContentPurgeError(
    'purge-scope-unsupported',
    'The selected source or one of its placements is outside current Human read access',
  );

export const readChannel = (
  human: HumanContext,
  db: DatabaseSync,
  channelId: string,
  ended = false,
  revision?: number,
) => {
  const row = db
    .prepare('SELECT record_json FROM channel_records WHERE channel_id = ?')
    .get(channelId);
  const record: unknown = row && JSON.parse(String(row.record_json));
  if (
    !isChannelRecord(record, channelId) ||
    (ended && (record.type !== 'group' || !record.deletedAt))
  )
    throw unsupported();
  if (record.type === 'dm' && record.botSlug && record.id === 'dm-' + record.botSlug) return record;
  const member = db
    .prepare(
      'SELECT visible_from_revision FROM channel_human_members WHERE channel_id = ? AND human_id = ? AND left_at IS NULL',
    )
    .get(channelId, human.humanId);
  if (!member || (revision !== undefined && revision < Number(member.visible_from_revision)))
    throw unsupported();
  return record;
};
const disbandedGroups = (db: DatabaseSync): Set<string> =>
  new Set(
    db
      .prepare(
        "SELECT channel_id FROM channel_records WHERE json_extract(record_json, '$.type') = 'group' AND json_extract(record_json, '$.deletedAt') IS NOT NULL AND json_extract(record_json, '$.name') = ''",
      )
      .all()
      .map((row) => String(row.channel_id)),
  );
export const inspect = (
  human: HumanContext,
  db: DatabaseSync,
  row: SourceRow,
): { message?: ChannelMessage; refusal?: string } => {
  const payload = JSON.parse(row.payload_json);
  const message: unknown =
    row.source_kind === 'bridge-message' && payload.external?.event?.actor?.id
      ? {
          id: row.message_id,
          at: row.created_at,
          body: row.body,
          author: { kind: 'bridged', source: payload.external.event.actor.id },
        }
      : { ...payload, body: row.body };
  if (!isChannelMessage(message)) return { refusal: unsupported().message };
  for (const placement of db
    .prepare('SELECT channel_id, revision FROM channel_placements WHERE source_event_id = ?')
    .all(row.source_event_id)) {
    try {
      readChannel(human, db, String(placement.channel_id), false, Number(placement.revision));
    } catch {
      return { refusal: unsupported().message };
    }
  }
  return { message: { ...(message as ChannelMessage), body: row.body } };
};

export function createPurgeScopes(
  options: Pick<Parameters<typeof mountContentPurge>[0], 'derivatives'>,
  port: ReturnType<typeof attachOperationalModule>,
  now: () => Date,
  getLedger: () => ReturnType<typeof openPurgeLedger> | undefined,
) {
  const describe = (human: HumanContext, db: DatabaseSync, rows: readonly SourceRow[]) => {
    const ids = rows.map((row) => row.source_event_id);
    const placements: PurgePreview['placements'] = [];
    const admissions: PurgePreview['admissions'] = [];
    const files = new Map<string, PurgePreview['files'][number]>();
    const effects: PurgePreview['effects'] = [];
    const retained = retainedManagedFiles(db, new Set(ids));
    const dependencies: unknown[] = [];
    for (const id of ids) {
      for (const placement of db
        .prepare('SELECT * FROM channel_placements WHERE source_event_id = ? ORDER BY channel_id')
        .all(id)) {
        const channel = readChannel(
          human,
          db,
          String(placement.channel_id),
          false,
          Number(placement.revision),
        );
        placements.push({
          channelId: channel.id,
          name: channel.name,
          messageId: String(placement.message_id),
        });
        dependencies.push(placement, channel);
      }
      const admitted = db
        .prepare('SELECT * FROM inbox_admissions WHERE source_event_id = ? ORDER BY bot_slug')
        .all(id);
      dependencies.push(admitted);
      for (const a of admitted)
        admissions.push({ botSlug: String(a.bot_slug), state: String(a.attempt_state) });
      for (const [identity, name] of managedSourceFiles(db, id))
        files.set(identity, {
          identity,
          name,
          disposition: retained.has(identity) ? 'shared' : 'remove',
        });
      for (const entry of db
        .prepare(
          "SELECT id, state, body FROM messaging_outbox WHERE (json_extract(body, '$.sourceEventId') = ? OR json_extract(body, '$.forwardSourceEventId') = ?) OR 'dm-mirror-' || id = ? ORDER BY id",
        )
        .all(id, id, id)) {
        effects.push({ id: String(entry.id), kind: 'outbox', state: String(entry.state) });
        dependencies.push(entry);
      }
      for (const entry of db
        .prepare(
          'SELECT session_id, activity FROM assignments WHERE source_event_id = ? ORDER BY session_id',
        )
        .all(id)) {
        effects.push({
          id: String(entry.session_id),
          kind: 'assignment',
          state: String(entry.activity),
        });
        dependencies.push(entry);
      }
      for (const entry of db
        .prepare(
          "SELECT source_event_id, attempt_state FROM source_events WHERE source_event_id != ? AND (json_extract(payload_json, '$.botCausation.rootSourceEventId') = ? OR json_extract(payload_json, '$.botCausation.parentSourceEventId') = ? OR json_extract(payload_json, '$.outboxOrigin.sourceEventId') = ?) ORDER BY source_event_id",
        )
        .all(id, id, id, id)) {
        effects.push({
          id: String(entry.source_event_id),
          kind: 'causal-source',
          state: String(entry.attempt_state),
        });
        dependencies.push(entry);
      }
    }
    const derivatives = ids.length
      ? (options.derivatives?.(ids, [...new Set(admissions.map((a) => a.botSlug))]) ?? [])
      : [];
    return {
      placements,
      admissions,
      files: [...files.values()],
      effects,
      derivatives,
      dependencies,
    };
  };
  const fingerprint = (
    subject: unknown,
    rows: readonly SourceRow[],
    described: ReturnType<typeof describe>,
  ) =>
    createHash('sha256')
      .update(
        JSON.stringify([
          subject,
          rows,
          described.dependencies,
          described.files,
          described.derivatives,
          getLedger()!.checkpoint(),
        ]),
      )
      .digest('hex');
  const scope = (human: HumanContext, channelId: string, ids: readonly string[]) =>
    port.read((db) => {
      readChannel(human, db, channelId, true);
      const selected = [...new Set(ids)].sort();
      if (!selected.length || selected.length > 100 || selected.length !== ids.length)
        throw unsupported();
      const rows = selected.map((id) => {
        const row = db
          .prepare(
            'SELECT e.* FROM source_events e JOIN channel_placements p USING(source_event_id) WHERE p.channel_id = ? AND e.source_event_id = ?',
          )
          .get(channelId, id) as unknown as SourceRow | undefined;
        if (!row || inspect(human, db, row).refusal) throw unsupported();
        return row;
      });
      const described = describe(human, db, rows);
      return { rows, ...described, fingerprint: fingerprint(channelId, rows, described) };
    });
  const older = (human: HumanContext, input: TextCleanupScope) =>
    port.read((db) => {
      const before = new Date(Math.min(Date.parse(input.before), now().getTime())).toISOString();
      const channelIds = [...new Set(input.channelIds ?? [])].sort();
      const chosen = input.channelIds === undefined ? undefined : new Set(channelIds);
      const ended = disbandedGroups(db);
      const kept = new Map<TextCleanupKeptReason, number>();
      const rows: SourceRow[] = [];
      const names = new Map<string, string>();
      let more = false;
      for (const candidate of db
        .prepare(
          'SELECT e.* FROM source_events e WHERE e.created_at < ? AND EXISTS (SELECT 1 FROM channel_placements p WHERE p.source_event_id = e.source_event_id) AND NOT EXISTS (SELECT 1 FROM messaging_purge_facts f WHERE f.source_event_id = e.source_event_id) ORDER BY e.created_at, e.source_event_id',
        )
        .iterate(before)) {
        const row = candidate as unknown as SourceRow;
        const placed = db
          .prepare('SELECT channel_id, revision FROM channel_placements WHERE source_event_id = ?')
          .all(row.source_event_id)
          .filter((p) => !ended.has(String(p.channel_id)));
        if (chosen && !placed.some((p) => chosen.has(String(p.channel_id)))) continue;
        if (inspect(human, db, row).refusal) continue;
        const reason: TextCleanupKeptReason | undefined =
          chosen && placed.some((p) => !chosen.has(String(p.channel_id)))
            ? 'shared'
            : db
                  .prepare(
                    "SELECT 1 FROM inbox_admissions WHERE source_event_id = ? AND attempt_state IN ('pending', 'running', 'retryable')",
                  )
                  .get(row.source_event_id)
              ? 'bot-working'
              : db
                    .prepare(
                      "SELECT 1 FROM messaging_outbox WHERE state IN ('pending', 'in-flight') AND (json_extract(body, '$.sourceEventId') = ? OR json_extract(body, '$.forwardSourceEventId') = ? OR 'dm-mirror-' || id = ?)",
                    )
                    .get(row.source_event_id, row.source_event_id, row.source_event_id)
                ? 'delivery-pending'
                : undefined;
        if (reason) {
          kept.set(reason, (kept.get(reason) ?? 0) + 1);
          continue;
        }
        if (rows.length === TEXT_CLEANUP_LIMIT) {
          more = true;
          break;
        }
        rows.push(row);
        for (const p of placed)
          names.set(String(p.channel_id), readChannel(human, db, String(p.channel_id)).name);
      }
      const described = describe(human, db, rows);
      const chats = new Map<string, number>();
      for (const placement of described.placements)
        if (!ended.has(placement.channelId))
          chats.set(placement.channelId, (chats.get(placement.channelId) ?? 0) + 1);
      return {
        rows,
        before,
        channelIds,
        more,
        ...described,
        kept: [...kept].map(([reason, messages]) => ({ reason, messages })),
        chats: [...chats].map(([channelId, messages]) => ({
          channelId,
          name: names.get(channelId) ?? channelId,
          messages,
        })),
        fingerprint: fingerprint([before, channelIds, more], rows, described),
      };
    });
  return { scope, older };
}
