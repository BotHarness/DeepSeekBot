import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { PersonaBotDeletions } from '../bots/deletion.js';
import { ProfileBackupError, treeFiles } from '../portability/files.js';

export interface BackupMemory {
  slug: string;
  repository: string;
  disposition: 'retained' | 'erased';
  files: { path: string; local: string }[];
}
export function profileMemoryFiles(
  registry: PersonaBotRegistry,
  deletions: PersonaBotDeletions,
): BackupMemory[] {
  const repositories = new Map<string, string>();
  return registry.listHistorical().map((bot) => {
    const deletion = deletions.get(bot.slug);
    if (deletion?.memory === 'pending')
      throw new ProfileBackupError('snapshot-changed', 'Memory erasure is incomplete');
    const path = deletion?.memoryDir ?? bot.memoryDir ?? join(registry.rootDir, bot.slug, 'memory');
    if (deletion?.memory === 'erased')
      return { slug: bot.slug, repository: '', disposition: 'erased', files: [] };
    try {
      const files = treeFiles(path);
      if (!files.some((file) => file.local === '.git/HEAD'))
        throw new Error('Managed Git repository is incomplete');
      if (
        files.some(
          (file) =>
            file.local === '.git/objects/info/alternates' || file.local === '.git/commondir',
        )
      )
        throw new Error('External Git object store');
      let repository = repositories.get(path);
      if (repository === undefined) {
        repository = 'memory/' + repositories.size;
        repositories.set(path, repository);
      }
      return { slug: bot.slug, repository, disposition: 'retained', files };
    } catch (cause) {
      throw new ProfileBackupError(
        'required-file-missing',
        'A retained managed Memory repository is unavailable',
        { cause },
      );
    }
  });
}

/**
 * Attachment hashes that Memory text still mentions, for storage cleanup and the
 * attachment sweep. Unlike a backup capture this is a best-effort read: links,
 * sockets, missing folders and incomplete Git repositories are skipped instead
 * of failing, so an unrelated quirk in one Bot's Memory cannot block cleanup.
 */
export function memoryAttachmentReferences(
  registry: PersonaBotRegistry,
  deletions: PersonaBotDeletions,
): Set<string> {
  const references = new Set<string>();
  const roots = new Set<string>();
  for (const bot of registry.listHistorical()) {
    const deletion = deletions.get(bot.slug);
    if (deletion?.memory === 'erased') continue;
    roots.add(deletion?.memoryDir ?? bot.memoryDir ?? join(registry.rootDir, bot.slug, 'memory'));
  }
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      if (missing(error)) return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '.git') walk(path);
      } else if (entry.isFile() && /\.(md|json|txt)$/iu.test(entry.name)) {
        let text;
        try {
          text = readFileSync(path, 'utf8');
        } catch (error) {
          if (missing(error)) continue;
          throw error;
        }
        for (const match of text.matchAll(/sha256:[0-9a-f]{64}/gu)) references.add(match[0]);
      }
    }
  };
  for (const root of roots) walk(root);
  return references;
}

function missing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}
