import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { composerRecoveryIdentity } from '../src/bridge/composer-recovery.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Host-issued recovery identity', () => {
  it('is stable across restart and separates Hosts and Profiles without exposing paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'composer-identity-'));
    roots.push(root);
    const host = join(root, 'host', 'id');
    const profile = join(root, 'profile', 'id');
    const identity = composerRecoveryIdentity(host, profile, 'local-human');
    expect(composerRecoveryIdentity(host, profile, 'local-human')).toEqual(identity);
    expect(
      composerRecoveryIdentity(join(root, 'other-host', 'id'), profile, 'local-human').hostId,
    ).not.toBe(identity.hostId);
    expect(
      composerRecoveryIdentity(host, join(root, 'other-profile', 'id'), 'local-human').profileId,
    ).not.toBe(identity.profileId);
    expect(JSON.stringify(identity)).not.toContain(root);
    if (process.platform !== 'win32') expect(statSync(host).mode & 0o777).toBe(0o600);
    writeFileSync(profile, '-'.repeat(36));
    expect(() => composerRecoveryIdentity(host, profile, 'local-human')).toThrow(
      'invalid composer identity',
    );
    writeFileSync(profile, 'corrupt');
    expect(() => composerRecoveryIdentity(host, profile, 'local-human')).toThrow(
      'invalid composer identity',
    );
  });
});
