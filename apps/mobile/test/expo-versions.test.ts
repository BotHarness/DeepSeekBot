import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classify } from '../scripts/check-expo-versions.mjs';

const script = fileURLToPath(new URL('../scripts/check-expo-versions.mjs', import.meta.url));
const dep = (packageName: string, actualVersion: string, expectedVersionOrRange: string) => ({
  packageName,
  packageType: 'dependencies',
  actualVersion,
  expectedVersionOrRange,
});
const run = (input: string) => spawnSync(process.execPath, [script], { input, encoding: 'utf8' });

describe('Expo dependency version check', () => {
  it('only warns about drift inside the SDK line', () => {
    const report = {
      dependencies: [
        dep('expo-router', '58.0.31', '~58.0.32'),
        dep('expo-web-browser', '58.0.8', '~58.1.0'),
        dep('react-native-screens', '4.30.1', '~4.31.0'),
      ],
    };
    expect(classify(report)).toEqual({
      errors: [],
      warnings: [
        'expo-router@58.0.31, expected ~58.0.32',
        'expo-web-browser@58.0.8, expected ~58.1.0',
        'react-native-screens@4.30.1, expected ~4.31.0',
      ],
    });
    const result = run(JSON.stringify(report));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('::warning title=Expo patch drift::expo-router@58.0.31');
  });

  it('fails on an SDK or 0.x minor mismatch', () => {
    const report = {
      dependencies: [
        dep('expo', '57.0.30', '~58.0.26'),
        dep('react-native', '0.87.1', '0.88.1'),
        dep('expo-sqlite', '58.0.17', '~58.0.18'),
      ],
    };
    expect(classify(report).errors).toEqual([
      'expo@57.0.30, expected ~58.0.26',
      'react-native@0.87.1, expected 0.88.1',
    ]);
    const result = run(JSON.stringify(report));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('::error title=Expo SDK mismatch::expo@57.0.30');
  });

  it('passes when everything matches and fails on unreadable input', () => {
    expect(run(JSON.stringify({ dependencies: [], upToDate: true })).status).toBe(0);
    expect(run('').status).toBe(1);
    expect(run('{}').status).toBe(1);
  });
});
