import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { compareVersions, isReleaseVersion } from './version.js';

export type ReleasePrompt =
  | { status: 'claimed' }
  | {
      status: 'suppressed';
      reason: 'not-beta' | 'busy' | 'changed' | 'no-update' | 'already-prompted';
    }
  | {
      status: 'failed';
      reason: 'invalid-version' | 'storage-unavailable' | 'activity-unavailable';
    };

function removeTemporary(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch {
    return;
  }
}

export function claimReleasePrompt(dataDir: string | undefined, version: string): ReleasePrompt {
  if (dataDir === undefined) return { status: 'failed', reason: 'storage-unavailable' };
  const path = join(dataDir, 'release-prompt.json');
  const temporary = join(dataDir, `.release-prompt-${randomUUID()}.tmp`);
  try {
    let previous: unknown;
    try {
      previous = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    if (previous !== undefined) {
      if (
        typeof previous !== 'object' ||
        previous === null ||
        !('version' in previous) ||
        typeof previous.version !== 'string' ||
        !isReleaseVersion(previous.version)
      )
        return { status: 'failed', reason: 'storage-unavailable' };
      if (compareVersions(version, previous.version) <= 0)
        return { status: 'suppressed', reason: 'already-prompted' };
    }
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(temporary, `${JSON.stringify({ version })}\n`, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
    return { status: 'claimed' };
  } catch {
    return { status: 'failed', reason: 'storage-unavailable' };
  } finally {
    removeTemporary(temporary);
  }
}
