import { existsSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import type { OperationalDatabaseOwner } from '../database/owner.js';
import { attachOperationalModule } from '../database/owner.js';
import { retainedManagedFiles } from '../purge/references.js';
import { attachmentIdentity, isChannelAttachmentRef } from './ref.js';
import type { AttachmentStore } from './store.js';
import { ProfileBackupError, treeFiles } from '../portability/files.js';

export function collectAttachmentReferences(db: DatabaseSync, required: Set<string>): Set<string> {
  const rebound = new Map<string, string>();
  for (const row of db
    .prepare(
      'SELECT original_json, target_json FROM attachment_file_bindings WHERE target_json IS NOT NULL',
    )
    .all()) {
    const original: unknown = JSON.parse(String(row.original_json));
    const target: unknown = JSON.parse(String(row.target_json));
    if (isChannelAttachmentRef(original) && isChannelAttachmentRef(target))
      rebound.set(attachmentIdentity(original), attachmentIdentity(target));
  }
  const visit = (value: unknown): void => {
    if (isChannelAttachmentRef(value))
      required.add(rebound.get(attachmentIdentity(value)) ?? attachmentIdentity(value));
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  for (const row of db.prepare('SELECT payload_json FROM source_events').all())
    visit(JSON.parse(String(row.payload_json)));
  for (const row of db.prepare('SELECT body FROM messaging_outbox').all())
    visit(JSON.parse(String(row.body)));
  for (const row of db
    .prepare('SELECT target_json FROM attachment_file_bindings WHERE target_json IS NOT NULL')
    .all())
    visit(JSON.parse(String(row.target_json)));
  return retainedManagedFiles(db);
}

export function profileAttachmentFiles(
  database: OperationalDatabaseOwner,
  store: AttachmentStore,
  soulReferences: readonly string[],
): { path: string; local: string }[] {
  const required = new Set(soulReferences);
  const candidates = attachOperationalModule(database, 'attachments').read((db) =>
    collectAttachmentReferences(db, required),
  );
  const result: { path: string; local: string }[] = [];
  for (const id of new Set([...required, ...candidates])) {
    try {
      if (id.startsWith('file:')) {
        const root = join(store.rootDir, 'files', id.slice(5));
        if (!required.has(id) && !existsSync(root)) continue;
        store.fileTarget(id);
        result.push(
          ...treeFiles(root).map((file) => ({
            path: file.path,
            local: 'attachments/files/' + id.slice(5) + '/' + file.local,
          })),
        );
      } else {
        const hex = id.slice(7);
        const path = join(store.rootDir, 'objects', hex.slice(0, 2), hex);
        if (!required.has(id) && !existsSync(path)) continue;
        result.push({ path, local: 'attachments/objects/' + hex.slice(0, 2) + '/' + hex });
      }
    } catch {
      throw new ProfileBackupError(
        'required-file-missing',
        'A referenced attachment is unavailable',
      );
    }
  }
  return result;
}
