import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { macVideoBuild } from '../src/media/install-macos.js';

const electron = process.env['BH_TEST_ELECTRON'];
it.skipIf(!electron)(
  'reuses physical ASAR files in the Electron carrier without downloads',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'computer-electron-'));
    try {
      const files: Record<string, string> = {};
      for (const name of [
        'Electron.app/Contents/MacOS/Electron',
        'Electron.app/Contents/Resources/default_app.asar',
        'LICENSE',
        'LICENSES.chromium.html',
      ]) {
        const file = join(directory, 'runtime', name);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, name);
        files[name] = createHash('sha256').update(name).digest('hex');
      }
      await writeFile(
        join(directory, 'runtime', '.botharness-video-runtime.json'),
        JSON.stringify({ archiveSha256: macVideoBuild().sha256, files }),
      );
      for (const [source, output] of [
        ['../src/media/install-macos.ts', 'install.mjs'],
        ['../src/local-video-contract.ts', 'contract.mjs'],
      ]) {
        const text = await readFile(new URL(source!, import.meta.url), 'utf8');
        await writeFile(
          join(directory, output!),
          stripTypeScriptTypes(text, { mode: 'transform' }).replace(
            '../local-video-contract.js',
            './contract.mjs',
          ),
        );
      }
      await writeFile(
        join(directory, 'run.mjs'),
        `import assert from 'node:assert/strict';
import { ensureMacVideoHelper, verifyMacVideoHelper } from './install.mjs';
let downloads = 0;
globalThis.fetch = async () => { downloads++; throw Error('unexpected download'); };
const dir = new URL('./runtime', import.meta.url).pathname;
assert.equal(await verifyMacVideoHelper(dir), true);
for (let attempt = 0; attempt < 2; attempt++) {
  await ensureMacVideoHelper({ dir, runner: { run: async () => { throw Error('unexpected extraction'); } } });
}
assert.equal(downloads, 0);
assert.notEqual(process.noAsar, true);
console.log('PASS: two starts, zero downloads, ASAR support unchanged');
`,
      );
      const { stdout } = await promisify(execFile)(electron!, [join(directory, 'run.mjs')], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        timeout: 10_000,
      });
      expect(stdout).toContain('PASS: two starts, zero downloads, ASAR support unchanged');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
