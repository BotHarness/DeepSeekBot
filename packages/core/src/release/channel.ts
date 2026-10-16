import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type ReleaseChannel = 'stable' | 'beta';

export interface ReleaseChannelStatus {
  channel: ReleaseChannel;
  writable: boolean;
}

export type ReleaseChannelChange =
  | { status: 'saved'; channel: ReleaseChannel }
  | { status: 'failed'; reason: 'busy' | 'storage-unavailable' };

export function readReleaseChannel(dataDir: string | undefined): ReleaseChannel {
  if (dataDir === undefined) return 'stable';
  try {
    const value: unknown = JSON.parse(readFileSync(join(dataDir, 'release-channel.json'), 'utf8'));
    return typeof value === 'object' &&
      value !== null &&
      'channel' in value &&
      value.channel === 'beta'
      ? 'beta'
      : 'stable';
  } catch {
    return 'stable';
  }
}

export function writeReleaseChannel(dataDir: string, channel: ReleaseChannel): void {
  mkdirSync(dataDir, { recursive: true });
  const temporary = join(dataDir, `.release-channel-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify({ channel })}\n`, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, join(dataDir, 'release-channel.json'));
  } finally {
    rmSync(temporary, { force: true });
  }
}
