import { describe, expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const lookups = [
  {
    sql: `SELECT output.message_id FROM channel_output_origins origin
      JOIN source_events output ON output.source_event_id = origin.source_event_id
     WHERE origin.request_source_event_id = ? AND output.channel_id = ?`,
    index: 'channel_output_origins_request',
  },
  {
    sql: 'SELECT session_id FROM session_ownership WHERE parent_session_id = ?',
    index: 'session_ownership_parent',
  },
];

describe('Session and output lookup indexes', () => {
  it.each(lookups)('uses $index instead of scanning history', ({ sql, index }) => {
    const owner = trackTestOwner(
      mountOperationalDatabase({ dshHome: createTempRoot(), schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const plan = attachOperationalModule(owner, 'message-lookup-index').read((db) =>
      db
        .prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .all()
        .map((row) => String((row as { detail: string }).detail)),
    );
    expect(plan.join('\n')).toContain(`USING INDEX ${index}`);
    expect(plan.some((detail) => /^SCAN /.test(detail))).toBe(false);
  });
});
