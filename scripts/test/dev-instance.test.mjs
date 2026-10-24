import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { dshCommand } from '../dev-instance.mjs';
import { assertDshVersion } from '../dsh-compatibility.mjs';

describe('development CLI admission', () => {
  it.each([
    '0.2.0-rc.1',
    '0.2.0',
    '0.2.1-rc.2',
    '0.2.1-rc.3',
    '0.2.1-rc.99',
    '0.2.2-rc.1',
    '0.3.0-rc.1',
    '1.0.0-rc.1',
  ])('launches installed %s independently of the SDK pin', (version) => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-admission-'));
    try {
      const cli = join(root, 'node_modules/@deepseek-ai/dsh');
      mkdirSync(join(cli, 'lib'), { recursive: true });
      writeFileSync(join(cli, 'lib/bin.js'), '');
      writeFileSync(join(cli, 'package.json'), JSON.stringify({ version }));
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ devDependencies: { '@deepseek-ai/dsh': '0.2.1-rc.3' } }),
      );
      expect(dshCommand(root)).toEqual([process.execPath, join(cli, 'lib/bin.js')]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it.each(['0.1.9', 'latest', undefined])(
    'rejects missing or below-floor version %s',
    (version) => {
      expect(() => assertDshVersion(version)).toThrow('API floor');
    },
  );
});
