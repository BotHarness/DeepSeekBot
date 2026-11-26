import { describe, expect, it } from 'vitest';

import { sourceFilesMatching, writesTables } from './source-files.js';

const SQLITE_OPENERS = [
  'database/migrations/messaging-delivery.ts',
  'database/owner.ts',
  'logs/log-db.ts',
  'purge/ledger.ts',
];

const MESSAGING_TABLE_WRITERS = [
  'channels/question-answer-receipts.ts',
  'channels/sqlite-store.ts',
  'database/migrations/assignments.ts',
  'database/migrations/bot-inbox.ts',
  'database/migrations/bot-runtime.ts',
  'database/migrations/messaging-channels.ts',
  'database/migrations/messaging-history.ts',
  'database/migrations/voice.ts',
  'features/activity/events.ts',
  'features/activity/inbox-harvest.ts',
  'features/activity/runtime-admission-recovery.ts',
  'features/activity/runtime-admissions.ts',
  'features/assignments/events.ts',
  'features/assignments/reporting.ts',
  'features/assignments/runtime-lifecycle.ts',
  'features/memory/runtime-changes.ts',
  'features/messaging/events.ts',
  'features/sessions/runtime-orchestrator-turns.ts',
  'messaging/channel-target.ts',
  'messaging/conversation-ingest.ts',
  'messaging/feedback.ts',
  'messaging/inbound.ts',
  'messaging/member-admission.ts',
  'messaging/outbound.ts',
  'messaging/pairing.ts',
  'messaging/permissions/senders.ts',
  'messaging/profile-restore.ts',
  'messaging/report.ts',
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
