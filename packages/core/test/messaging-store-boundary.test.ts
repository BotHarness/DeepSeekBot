import { describe, expect, it } from 'vitest';

import { sourceFilesMatching, writesTables } from './source-files.js';

const SQLITE_OPENERS = [
  'database/owner.ts',
  'database/schema-plan.ts',
  'logs/log-db.ts',
  'purge/ledger.ts',
];

const MESSAGING_TABLE_WRITERS = [
  'channels/question-answer-receipts.ts',
  'channels/sqlite-store.ts',
  'database/schema-plan.ts',
  'features/activity/events.ts',
  'features/assignments/events.ts',
  'features/assignments/reporting.ts',
  'features/messaging/events.ts',
  'messaging/channel-target.ts',
  'messaging/conversation-ingest.ts',
  'messaging/feedback.ts',
  'messaging/inbound.ts',
  'messaging/member-admission.ts',
  'messaging/outbound.ts',
  'messaging/pairing.ts',
  'messaging/profile-restore.ts',
  'messaging/report.ts',
  'messaging/sender-access.ts',
  'purge/owner.ts',
  'runtime/bot-runtime.ts',
  'runtime/inbox-triage.ts',
  'runtime/profile-restore.ts',
  'schedules/bot-schedules.ts',
  'storage/media-cleanup.ts',
];

describe('Messaging store boundary', () => {
  it('opens SQLite only through the operational database owner, the log store and the Purge Ledger', () => {
    expect(sourceFilesMatching(/^[^`\n]*new DatabaseSync\(/mu)).toEqual(SQLITE_OPENERS);
  });

  it('writes the Messaging tables only from the files that already do, and drops a file once it stops', () => {
    const writers = sourceFilesMatching(
      writesTables(['source_events', 'channel_placements', 'inbox_admissions', 'messaging_outbox']),
    );
    expect(writers).toEqual(MESSAGING_TABLE_WRITERS);
  });
});
