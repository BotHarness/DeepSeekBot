import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freshProfileOverrides, ignoredBuilds } from '../e2e-fresh-profile-install.mjs';

describe('fresh Profile install gate', () => {
  it('redirects only the unpublished release dependencies to their tarballs', () => {
    expect(
      freshProfileOverrides({
        directory: '/release',
        artifacts: [
          { name: '@botharness/core', filename: 'botharness-core-1.3.1.tgz' },
          { name: 'deepseekbot', filename: 'deepseekbot-1.3.1.tgz' },
        ],
      }),
    ).toEqual({ '@botharness/core': 'file:/release/botharness-core-1.3.1.tgz' });
  });

  it('names the dependency whose build a user would have to approve', () => {
    expect(
      ignoredBuilds(
        'Error: ERR_PNPM_IGNORED_BUILDS\n  ╰─▶ Ignored build scripts: agent-browser@0.38.2\n',
      ),
    ).toBe('agent-browser@0.38.2');
    expect(ignoredBuilds('dependencies:\n+ deepseekbot 1.3.1\n')).toBe('');
  });

  it('keeps agent-browser out of the installed Browser dependencies', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../packages/browser/package.json', import.meta.url), 'utf8'),
    );
    expect(manifest.dependencies['agent-browser']).toBeUndefined();
    expect(manifest.peerDependenciesMeta['agent-browser']).toEqual({ optional: true });
  });
});
