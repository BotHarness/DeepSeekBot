import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import { describe, expect, it } from 'vitest';
import { productDshRange, productDshVersions } from '../product-artifacts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packages = ['core', 'client', 'deepseekbot'];

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

  it('separates the supported Host floor from the pinned build baseline', () => {
    const range = manifest('core').engines.dsh;
    const pinned = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies[
      '@deepseek-ai/dsh'
    ];
    expect(semver.minVersion(range)?.version).toBe('0.1.7-0');
    expect(semver.satisfies(pinned, range, { includePrerelease: true })).toBe(true);
  });

  it('includes the qualified matrix with native DSH prerelease semantics', () => {
    const range = manifest('core').engines.dsh;
    for (const version of productDshVersions)
      expect(semver.satisfies(version, range, { includePrerelease: true })).toBe(true);
    expect(semver.satisfies('0.2.0', range, { includePrerelease: true })).toBe(true);
    expect(semver.satisfies('0.1.6-alpha.2', range, { includePrerelease: true })).toBe(false);
    expect(semver.satisfies('0.3.0-rc.1', range, { includePrerelease: true })).toBe(true);
    expect(semver.satisfies('1.0.0', range, { includePrerelease: true })).toBe(true);
  });
});
