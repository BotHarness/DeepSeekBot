import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspectProfileBackup, restoreProfileBackup, PROFILE_BACKUP_LIMITS } from './package.js';
import { ProfileBackupError } from './files.js';

export async function runProfileRestoreCli(argv: readonly string[]): Promise<void> {
  const [action, ...args] = argv;
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index],
      value = args[index + 1];
    if (!key || !['--file', '--new-home'].includes(key) || !value || options.has(key))
      throw new Error(
        'Use inspect --file <backup> or restore --file <backup> --new-home <new directory>',
      );
    options.set(key, value);
  }
  if (!action || !['inspect', 'restore'].includes(action) || !options.has('--file'))
    throw new Error(
      'Use inspect --file <backup> or restore --file <backup> --new-home <new directory>',
    );
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  try {
    const file = resolve(options.get('--file')!);
    if (statSync(file).size > PROFILE_BACKUP_LIMITS.maxTotalBytes)
      throw new ProfileBackupError('too-large', 'Backup exceeds package resource bound');
    const archive = readFileSync(file);
    if (action === 'inspect') {
      const { manifest } = inspectProfileBackup(archive);
      console.log(
        JSON.stringify(
          {
            id: manifest.id,
            counts: manifest.counts,
            sessions: manifest.sessions,
            dependencies: manifest.dependencies,
            purgeFacts: manifest.purge.facts.length,
          },
          null,
          2,
        ),
      );
    } else {
      if (!options.has('--new-home'))
        throw new Error('Restore requires --new-home pointing to a directory that does not exist');
      const receipt = await restoreProfileBackup(archive, resolve(options.get('--new-home')!), {
        signal: controller.signal,
      });
      console.log(
        JSON.stringify(
          {
            id: receipt.id,
            home: receipt.destinationHome,
            state: 'stopped',
            mode: receipt.mode,
            next: 'Launch this DSH_HOME with a compatible trusted Tobs installation. Open Bot-mode Settings to review readiness, authorize the target model and explicitly activate one Bot.',
          },
          null,
          2,
        ),
      );
    }
  } finally {
    process.removeListener('SIGINT', cancel);
  }
}
