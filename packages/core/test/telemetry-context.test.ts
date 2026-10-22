import { expect, it } from 'vitest';
import {
  cpuCountBucket,
  hostContextProperties,
  totalMemoryBucket,
} from '../src/telemetry/context.js';

it.each([
  [1, '1-2'],
  [2, '1-2'],
  [3, '3-4'],
  [4, '3-4'],
  [5, '5-8'],
  [8, '5-8'],
  [9, '9-16'],
  [16, '9-16'],
  [17, '17plus'],
  [128, '17plus'],
  [0, 'unknown'],
  [-1, 'unknown'],
  [1.5, 'unknown'],
  [NaN, 'unknown'],
  [Infinity, 'unknown'],
] as const)('buckets %s logical CPUs as %s', (count, bucket) => {
  expect(cpuCountBucket(count)).toBe(bucket);
});

it.each([
  [0, 'unknown'],
  [-1, 'unknown'],
  [NaN, 'unknown'],
  [Infinity, 'unknown'],
  [2, '<=4'],
  [4, '<=4'],
  [4.01, '8'],
  [8, '8'],
  [8.01, '16'],
  [16, '16'],
  [16.01, '32'],
  [32, '32'],
  [32.01, '64plus'],
  [48, '64plus'],
  [64, '64plus'],
  [128, '64plus'],
] as const)('buckets %s GiB as %s', (gb, bucket) => {
  expect(totalMemoryBucket(gb * 1024 ** 3)).toBe(bucket);
});

it('does not retain arbitrary platform, architecture, version or kernel values', () => {
  const result = hostContextProperties({
    pluginVersion: '/private/package.json',
    dshVersion: 'private-host',
    os: 'private-host',
    arch: '/private/path',
    nodeVersion: 'private-user',
    osRelease: 'private-kernel',
    cpuCount: NaN,
    totalMemory: 0,
  });
  expect(Object.values(result)).toEqual(Array(8).fill('unknown'));
});
