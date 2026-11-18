import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  MIN_HOST_VERSION,
  MIN_PHONE_APP_VERSION,
  belowMinimum,
} from '../src/devices/client-compat.js';
import { compareVersions } from '../src/release/version.js';

const part = fc.nat({ max: 30 });
const prerelease = fc.array(
  fc.oneof(fc.nat({ max: 20 }).map(String), fc.constantFrom('alpha', 'beta', 'rc', 'next')),
  { minLength: 1, maxLength: 3 },
);
const release = fc
  .tuple(part, part, part, fc.option(prerelease, { nil: undefined }))
  .filter(([major, minor, patch]) => major + minor + patch > 0)
  .map(
    ([major, minor, patch, tag]) =>
      `${major}.${minor}.${patch}${tag === undefined ? '' : `-${tag.join('.')}`}`,
  );
const unusable = fc.oneof(
  fc.constant(undefined),
  fc.constantFrom('', '0.0.0', 'dev', 'v1.0.0', '1.7', '01.2.3', '1.2.3-', 'latest'),
  fc.tuple(part, part).map(([minor, patch]) => `0.${minor}.${patch}`),
  fc.string({ maxLength: 12 }).filter((value) => !/^\d+\.\d+\.\d+/u.test(value)),
);
const floor = fc.oneof(fc.constantFrom(MIN_HOST_VERSION, MIN_PHONE_APP_VERSION), release);

describe('Phone and computer tolerate each other (docs/decisions/connections.md)', () => {
  it('never flags a missing, development or malformed version as below a floor', () => {
    fc.assert(
      fc.property(unusable, floor, (version, minimum) => {
        expect(belowMinimum(version, minimum)).toBe(false);
      }),
      { numRuns: 1000 },
    );
  });

  it('flags a release exactly when it orders before the floor', () => {
    fc.assert(
      fc.property(release, floor, (version, minimum) => {
        if (version.startsWith('0.')) return;
        expect(belowMinimum(version, minimum)).toBe(compareVersions(version, minimum) < 0);
        expect(belowMinimum(minimum, minimum)).toBe(false);
      }),
      { numRuns: 1000 },
    );
  });

  it('orders releases as a total order: antisymmetric, transitive, prerelease first', () => {
    fc.assert(
      fc.property(release, release, release, (a, b, c) => {
        expect(compareVersions(a, a)).toBe(0);
        expect(compareVersions(a, b)).toBe(-compareVersions(b, a) || 0);
        if (compareVersions(a, b) <= 0 && compareVersions(b, c) <= 0)
          expect(compareVersions(a, c)).toBeLessThanOrEqual(0);
        const core = a.split('-')[0]!;
        if (core !== a) expect(compareVersions(a, core)).toBe(-1);
      }),
      { numRuns: 2000 },
    );
  });

  it('orders release cores by major, then minor, then patch', () => {
    fc.assert(
      fc.property(part, part, part, part, part, part, (a1, a2, a3, b1, b2, b3) => {
        const expected = Math.sign(a1 - b1) || Math.sign(a2 - b2) || Math.sign(a3 - b3);
        expect(compareVersions(`${a1 + 1}.${a2}.${a3}`, `${b1 + 1}.${b2}.${b3}`)).toBe(expected);
      }),
      { numRuns: 1000 },
    );
    expect(belowMinimum('1.6.0', '1.7.0')).toBe(true);
    expect(belowMinimum('1.7.0', '1.7.0')).toBe(false);
    expect(belowMinimum('1.8.0', '1.7.0')).toBe(false);
  });

  it('follows SemVer precedence for prerelease identifiers', () => {
    fc.assert(
      fc.property(
        part,
        fc.nat({ max: 50 }),
        fc.nat({ max: 50 }),
        fc.constantFrom('alpha', 'beta', 'rc'),
        (major, left, right, word) => {
          const base = `${major + 1}.0.0`;
          expect(compareVersions(`${base}-${left}`, `${base}-${word}`)).toBe(-1);
          expect(compareVersions(`${base}-${left}`, `${base}-${right}`)).toBe(
            Math.sign(left - right),
          );
          expect(compareVersions(`${base}-${word}`, `${base}-${word}.${left}`)).toBe(-1);
        },
      ),
    );
  });
});
