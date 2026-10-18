import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import semver from 'semver';
import {
  productDshVersions,
  productDshRange,
  productManifest,
  providerDshRange,
  providerDshPeerRange,
  providerManifest,
} from '../product-artifacts.mjs';

const requireDsh = createRequire(
  realpathSync(new URL('../../node_modules/@deepseek-ai/dsh/package.json', import.meta.url)),
);
const { evaluatePluginCompatibility } = await import(
  requireDsh.resolve('@deepseek-ai/dsh-app-boot')
);
const manifests = ['core', 'client', 'deepseekbot', 'browser', 'computer', 'todo'].map((name) =>
  JSON.parse(readFileSync(new URL(`../../packages/${name}/package.json`, import.meta.url), 'utf8')),
);
const provider = providerManifest({
  name: '@xmanrui/dsh-im',
  version: '4.32.0',
  peerDependencies: { '@deepseek-ai/dsh-tools': '0.2.0-rc.1' },
});
const packed = productManifest(manifests[2], '1.4.0');
const releases = [...manifests, packed, provider];
const product = [...manifests, packed];

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
  it.each(['0.2.1-rc.3', '0.2.1', '0.2.2-alpha.1', '0.2.2-rc.2', '0.2.2', '0.2.99'])(
    'admits future 0.2.x version %s through native metadata preflight only',
    (version) => {
      for (const manifest of product)
        expect(evaluatePluginCompatibility(manifest, {}, version), manifest.name).toBeUndefined();
    },
  );
  it.each(['0.1.7', '0.2.0-rc.1', '0.3.0-alpha.1', '0.3.0', '1.0.0'])(
    'refuses Host %s, outside the adopted API line',
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
    expect(result.peerDependencies['@deepseek-ai/dsh-tools']).toBe(providerDshPeerRange);
    for (const version of productDshVersions)
      expect(semver.satisfies(version, result.peerDependencies['@deepseek-ai/dsh-tools'])).toBe(
        true,
      );
    expect(result.dsh.compatibility.dsh).toBe(providerDshRange);
  });
});
