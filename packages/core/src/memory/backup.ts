import { join } from 'node:path';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { PersonaBotDeletions } from '../bots/deletion.js';
import { ProfileBackupError, fixedFile, treeFiles } from '../portability/files.js';

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

export function memoryAttachmentReferences(
  registry: PersonaBotRegistry,
  deletions: PersonaBotDeletions,
): Set<string> {
  const references = new Set<string>();
  for (const repo of profileMemoryFiles(registry, deletions))
    for (const file of repo.files)
      if (/\.(md|json|txt)$/iu.test(file.local))
        for (const match of fixedFile(file.path)
          .data.toString('utf8')
          .matchAll(/sha256:[0-9a-f]{64}/gu))
          references.add(match[0]);
  return references;
}
