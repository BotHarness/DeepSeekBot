import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import semver from 'semver';
import {
  productDshVersions,
  productDshRange,
  productManifest,
  providerDshRange,
  providerManifest,
} from '../product-artifacts.mjs';

const requireDsh = createRequire(
  realpathSync(new URL('../../node_modules/@deepseek-ai/dsh/package.json', import.meta.url)),
);
const { evaluatePluginCompatibility } = await import(
  requireDsh.resolve('@deepseek-ai/dsh-app-boot')
);
const manifests = ['core', 'client', 'deepseekbot'].map((name) =>
  JSON.parse(readFileSync(new URL(`../../packages/${name}/package.json`, import.meta.url), 'utf8')),
);
const provider = providerManifest({
  name: '@xmanrui/dsh-im',
  version: '4.32.0',
  peerDependencies: { '@deepseek-ai/dsh-tools': '0.2.0-rc.1' },
});
const releases = [...manifests, productManifest(manifests[2], '1.3.1'), provider];
const product = [manifests[2], releases[3]];

describe('DSH native product compatibility preflight', () => {
  it.each(productDshVersions)('admits supported Host %s without an exemption', (version) => {
    for (const manifest of releases) {
      expect(evaluatePluginCompatibility(manifest, {}, version), manifest.name).toBeUndefined();
      expect(
        semver.satisfies(version, manifest.engines.dsh, { includePrerelease: true }),
        manifest.name,
      ).toBe(true);
    }
  });
  it.each(['0.1.7', '0.2.0-rc.1', '0.2.1-alpha.1', '0.2.1-alpha.2', '0.2.0', '1.0.0'])(
    'refuses Host %s, where the bundled Computer runtime is incompatible',
    (version) => {
      expect(semver.satisfies(version, productDshRange, { includePrerelease: true })).toBe(false);
      for (const manifest of product)
        expect(evaluatePluginCompatibility(manifest, {}, version)?.exempted, manifest.name).toBe(
          false,
        );
    },
  );
  it.each(['0.2.0-rc.1', '0.2.1-alpha.2', '1.0.0'])(
    'keeps the separately versioned Provider admissible on Host %s',
    (version) => {
      expect(evaluatePluginCompatibility(provider, {}, version)).toBeUndefined();
    },
  );
  it('preserves non-DSH peers and the independently qualified build baseline', () => {
    const result = providerManifest({
      peerDependencies: { react: '^18.3.1', '@deepseek-ai/dsh-tools': '0.2.0-rc.1' },
    });
    expect(result.peerDependencies.react).toBe('^18.3.1');
    expect(result.peerDependencies['@deepseek-ai/dsh-tools']).toBe(providerDshRange);
    expect(result.dsh.compatibility.dsh).toBe(providerDshRange);
  });
});
