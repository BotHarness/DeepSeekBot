import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { createTempRoot } from './helpers.js';

it('allows only the exact native store and probe paths while scanning identically named nested files', () => {
  const home = createTempRoot('bh-private-scan-');
  const canary = ['SYNTHETIC', '1380', 'key', 'A'].join('-');
  writeFileSync(join(home, '.credentials.yaml'), canary);
  writeFileSync(join(home, 'wire-canary-probe.mjs'), canary);
  const scan = () =>
    execFileSync(process.execPath, ['scripts/scan-private-input-evidence.mjs', home], {
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
    });
  expect(JSON.parse(scan()).violations).toEqual([]);
  mkdirSync(join(home, 'spill'));
  writeFileSync(join(home, 'spill', '.credentials.yaml'), canary);
  writeFileSync(join(home, 'spill', 'wire-canary-probe.mjs'), canary);
  let output = '';
  try {
    scan();
  } catch (error) {
    output = String((error as { stdout: string }).stdout);
  }
  expect(JSON.parse(output).violations).toEqual([
    join('spill', '.credentials.yaml'),
    join('spill', 'wire-canary-probe.mjs'),
  ]);
});

it('follows native result Spill references outside Home and checks their contents', () => {
  const home = createTempRoot('bh-private-scan-');
  const spill = join(createTempRoot('dsh-spill-scan-'), 'bash.txt');
  const canary = ['SYNTHETIC', '1380', 'key', 'A'].join('-');
  writeFileSync(join(home, '.credentials.yaml'), canary);
  writeFileSync(spill, canary);
  const event = {
    type: 'tool/result',
    data: {
      message: {
        content: [{ type: 'text', text: `Full formatted result stored at: ${spill}. Use read` }],
      },
    },
  };
  writeFileSync(join(home, 'session.zstd'), zstdCompressSync(JSON.stringify(event) + '\n'));
  let output = '';
  try {
    execFileSync(process.execPath, ['scripts/scan-private-input-evidence.mjs', home], {
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
    });
  } catch (error) {
    output = String((error as { stdout: string }).stdout);
  }
  expect(JSON.parse(output)).toMatchObject({
    spillFiles: 1,
    violations: ['native-spill-1'],
  });
});
