import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import { describe, expect, it } from 'vitest';
import { productDshRange, productDshPeerRange, productDshVersions } from '../product-artifacts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packages = ['core', 'client', 'deepseekbot', 'browser', 'computer', 'todo'];

function manifest(packageName) {
  return JSON.parse(readFileSync(join(root, 'packages', packageName, 'package.json'), 'utf8'));
}

describe('DSH engine declaration', () => {
  it('declares one shared SemVer range across the installable product packages', () => {
    const ranges = packages.map((packageName) => manifest(packageName).engines?.dsh);
    expect(ranges.every((range) => typeof range === 'string')).toBe(true);
    expect(new Set(ranges).size).toBe(1);
    expect(semver.validRange(ranges[0])).not.toBeNull();
    expect(ranges[0]).toBe(productDshRange);
  });

  it('uses the product range for Host-provided peers without loosening dev pins', () => {
    for (const name of packages) {
      for (const [peer, range] of Object.entries(manifest(name).peerDependencies ?? {})) {
        if (peer === '@deepseek-ai/dsh' || peer.startsWith('@deepseek-ai/dsh-'))
          expect(range, `${name}: ${peer}`).toBe(productDshPeerRange);
      }
    }
  });

  it('accepts qualified native peers under npm default prerelease rules', () => {
    for (const name of packages) {
      for (const [peer, range] of Object.entries(manifest(name).peerDependencies ?? {})) {
        if (peer === '@deepseek-ai/dsh' || peer.startsWith('@deepseek-ai/dsh-')) {
          for (const version of [...productDshVersions, '0.2.1', '0.2.2'])
            expect(semver.satisfies(version, range), `${name}: ${peer} ${version}`).toBe(true);
          for (const version of ['0.2.0-rc.1', '0.3.0-alpha.1', '0.3.0'])
            expect(semver.satisfies(version, range), `${name}: ${peer} ${version}`).toBe(false);
        }
      }
    }
    const cordis = manifest('client').peerDependencies['@deepseek-ai/cordis'];
    for (const version of ['4.0.4', '4.0.5']) expect(semver.satisfies(version, cordis)).toBe(true);
    expect(semver.satisfies('5.0.0', cordis)).toBe(false);
  });

  it('keeps the exact build baseline separate from forward admission', () => {
    const range = manifest('core').engines.dsh;
    const pinned = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies[
      '@deepseek-ai/dsh'
    ];
    const computerUse = manifest('computer').devDependencies['@deepseek-ai/dsh-computer-use'];
    expect(productDshVersions).toEqual(['0.2.0-rc.2', pinned]);
    expect(computerUse).toBe(pinned);
    expect(manifest('computer').dependencies['@deepseek-ai/dsh-computer-use']).toBeUndefined();
    expect(semver.minVersion(range).version).toBe('0.2.0-rc.2');
    for (const version of [
      ...productDshVersions,
      '0.2.1-rc.3',
      '0.2.1',
      '0.2.2-rc.1',
      '0.2.2',
      '0.2.99',
    ])
      expect(semver.satisfies(version, range, { includePrerelease: true })).toBe(true);
    for (const version of [
      '0.2.0-rc.1',

      '0.3.0-alpha.1',
      '0.3.0-rc.1',
      '0.3.0',
      '1.0.0',
    ])
      expect(semver.satisfies(version, range, { includePrerelease: true })).toBe(false);
  });
});
