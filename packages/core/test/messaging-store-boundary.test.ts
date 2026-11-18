import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = join(import.meta.dirname, '..', 'src');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [relative(SOURCE, path).split('\\').join('/')] : [];
  });

const filesMatching = (pattern: RegExp) =>
  sourceFiles(SOURCE)
    .filter((file) => pattern.test(readFileSync(join(SOURCE, file), 'utf8')))
    .sort();

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
    expect(filesMatching(/^[^`\n]*new DatabaseSync\(/mu)).toEqual(SQLITE_OPENERS);
  });

  it('writes the Messaging tables only from the files that already do, and drops a file once it stops', () => {
    const writers = filesMatching(
      /(INSERT(\s+OR\s+[A-Z]+)?\s+INTO|UPDATE|DELETE\s+FROM)\s+(source_events|channel_placements|inbox_admissions|messaging_outbox)\b/u,
    );
    expect(writers).toEqual(MESSAGING_TABLE_WRITERS);
  });
});
