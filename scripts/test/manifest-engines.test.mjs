import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import { describe, expect, it } from 'vitest';
import { productDshRange, productDshVersions } from '../product-artifacts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packages = ['core', 'client', 'deepseekbot', 'browser', 'computer'];

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

  it('supports exactly the DSH release the bundled Computer runtime and the repository pin target', () => {
    const range = manifest('core').engines.dsh;
    const pinned = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies[
      '@deepseek-ai/dsh'
    ];
    const computerUse = manifest('computer').dependencies['@deepseek-ai/dsh-computer-use'];
    expect(productDshVersions).toEqual([pinned]);
    expect(computerUse).toBe(pinned);
    for (const version of productDshVersions)
      expect(semver.satisfies(version, range, { includePrerelease: true })).toBe(true);
    for (const version of ['0.2.0-rc.1', '0.2.1-alpha.1', '0.2.1-alpha.2', '0.2.0', '0.3.0-rc.1'])
      expect(semver.satisfies(version, range, { includePrerelease: true })).toBe(false);
  });
});
