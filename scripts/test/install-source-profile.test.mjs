import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ run: vi.fn(), verify: vi.fn() }));
vi.mock('node:child_process', () => ({ spawnSync: fixture.run }));
vi.mock('../packaged-profile.mjs', () => ({
  verifiedProductArtifacts: () => ({ dsh: '0.2.1-rc.3' }),
  packagedProfileManifest: (value) => value,
  packagedWorkspaceSettings: () => 'packages: [.]\n',
  verifyPackagedProfile: () => ({ verified: true }),
  parseProductComposition: (value) => value,
  verifyProductComposition: fixture.verify,
}));
import { installSourceProfile } from '../install-source-profile.mjs';

describe('source Profile install admission', () => {
  it.each(['0.2.0-rc.2', '0.2.1-rc.2', '0.2.1-rc.99', '0.2.2-rc.1'])(
    'installs on %s without matching the artifact build label',
    (version) => {
      const home = mkdtempSync(join(tmpdir(), 'source-profile-version-'));
      try {
        fixture.run.mockReset();
        fixture.verify.mockClear();
        fixture.run.mockImplementation((command, args) => {
          if (args.includes('--version'))
            return { status: 0, stdout: command === 'test-dsh' ? version : '12.4.2' };
          if (args.includes('--from-default-profile')) {
            const directory = join(home, 'profiles/test');
            mkdirSync(directory, { recursive: true });
            writeFileSync(join(directory, 'package.json'), '{}');
          }
          return { status: 0, stdout: '' };
        });
        expect(
          installSourceProfile({ home, profile: 'test', artifacts: home, dsh: 'test-dsh' }),
        ).toMatchObject({ dshVersion: version, componentsVerified: true });
        expect(fixture.verify).toHaveBeenCalledOnce();
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    },
  );
});
