import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import assert from 'node:assert/strict';

export function inspectEpisodeResponsibility(db, { botSlugs, channelId, messageId }) {
  assert(botSlugs.length > 0 && botSlugs.every((s) => typeof s === 'string' && s.length > 0));
  const source = db
    .prepare('SELECT source_event_id FROM channel_placements WHERE channel_id=? AND message_id=?')
    .get(channelId, messageId);
  assert(source, 'Original request must have a canonical placement');
  const rows = db
    .prepare(`SELECT source_event_id,bot_slug,opened_at,resolved_at,ignored_at,snoozed_until
 FROM inbox_admissions WHERE bot_slug IN (${botSlugs.map(() => '?').join(',')})
 AND (source_event_id=? OR opened_at IS NOT NULL OR snoozed_until IS NOT NULL)`)
    .all(...botSlugs, source.source_event_id);
  const originals = rows.filter((r) => r.source_event_id === source.source_event_id);
  assert(originals.length > 0, 'Original request admission must exist');
  assert(
    originals.some((r) => r.bot_slug === botSlugs[0]),
    'Acting Bot must own original admission',
  );
  const pending = rows.filter(
    (r) =>
      !r.resolved_at &&
      !r.ignored_at &&
      (r.opened_at !== null ||
        r.snoozed_until !== null ||
        (r.source_event_id === source.source_event_id && r.bot_slug === botSlugs[0])),
  );
  return {
    observedAt: new Date().toISOString(),
    originalSourceEventId: source.source_event_id,
    originals,
    pendingCount: pending.length,
    pending: pending.slice(0, 100),
    pendingTruncated: pending.length > 100,
    complete: pending.length === 0,
  };
}

export function readEpisodeResponsibility(instance, input) {
  assert.equal(new URL(instance.url).hostname, '127.0.0.1');
  const file = join(instance.home, 'botharness', 'botharness.db');
  assert(existsSync(file));
  assert.equal(
    resolve(realpathSync(file)),
    resolve(realpathSync(instance.home), 'botharness', 'botharness.db'),
  );
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return inspectEpisodeResponsibility(db, input);
  } finally {
    db.close();
  }
}
