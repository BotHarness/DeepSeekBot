import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';

export const spaceRowSchema = z.object({
  space_id: z.string(),
  kind: z.enum(['account', 'shared']),
  name: z.string(),
  owner_human_id: z.string().nullable(),
  audience_json: z.string().nullable(),
});
export const spaceDeletionSchema = z.object({
  kind: z.literal('space-delete'),
  row: spaceRowSchema.extend({ kind: z.literal('shared') }),
});
export const spaceDeletionKey = (spaceId: string): string => 'space-delete/' + spaceId;

export function recordSpaceDeletion(
  connection: DatabaseSync,
  row: z.infer<typeof spaceRowSchema>,
): void {
  connection
    .prepare('INSERT INTO workspace_file_transfers VALUES (?, ?)')
    .run(spaceDeletionKey(row.space_id), JSON.stringify({ kind: 'space-delete', row }));
}

export function restoreSpaceDeletion(
  db: OperationalDatabaseModulePort,
  row: z.infer<typeof spaceRowSchema>,
): void {
  db.transaction(
    (connection) => {
      connection
        .prepare('INSERT OR IGNORE INTO workspace_spaces VALUES (?, ?, ?, ?, ?)')
        .run(row.space_id, row.kind, row.name, row.owner_human_id, row.audience_json);
      connection
        .prepare('DELETE FROM workspace_file_transfers WHERE human_id = ?')
        .run(spaceDeletionKey(row.space_id));
    },
    ['workspace-spaces'],
  );
}
