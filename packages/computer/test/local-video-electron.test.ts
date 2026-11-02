import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { macVideoBuild } from '../src/media/install-macos.js';
import { LOCAL_VIDEO_ARCHIVE_SHA256, LOCAL_VIDEO_LAUNCHER } from '../src/media/install.js';

const electron = process.env['BH_TEST_ELECTRON'];
it.skipIf(!electron).each(['darwin', 'win32'])(
  'reuses physical ASAR files in the Electron carrier without downloads (%s)',
  async (platform) => {
    const directory = await mkdtemp(join(tmpdir(), 'computer-electron-'));
    try {
      const files: Record<string, string> = {};
      for (const name of [
        ...(platform === 'darwin'
          ? [
              'Electron.app/Contents/MacOS/Electron',
              'Electron.app/Contents/Resources/default_app.asar',
            ]
          : ['electron.exe', LOCAL_VIDEO_LAUNCHER, 'resources/default_app.asar']),
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
        JSON.stringify({
          archiveSha256:
            platform === 'darwin' ? macVideoBuild().sha256 : LOCAL_VIDEO_ARCHIVE_SHA256,
          launcherSourceSha256: createHash('sha256')
            .update(await readFile(new URL('../native/local-video/launcher.cs', import.meta.url)))
            .digest('hex'),
          files,
        }),
      );
      for (const [source, output] of [
        [
          platform === 'darwin' ? '../src/media/install-macos.ts' : '../src/media/install.ts',
          'install.mjs',
        ],
        ['../src/local-video-contract.ts', 'contract.mjs'],
      ]) {
        const text = await readFile(new URL(source!, import.meta.url), 'utf8');
        await writeFile(
          join(directory, output!),
          stripTypeScriptTypes(text, { mode: 'transform' })
            .replace('../local-video-contract.js', './contract.mjs')
            .replace(
              "createRequire(import.meta.url).resolve('@botharness/computer/package.json')",
              JSON.stringify(fileURLToPath(new URL('../package.json', import.meta.url))),
            ),
        );
      }
      await writeFile(
        join(directory, 'run.mjs'),
        `import assert from 'node:assert/strict';
import { ${platform === 'darwin' ? 'ensureMacVideoHelper as ensure, verifyMacVideoHelper as verify' : 'ensureLocalVideoHelper as ensure, verifyLocalVideoHelper as verify'} } from './install.mjs';
import { fileURLToPath } from 'node:url';
let downloads = 0;
globalThis.fetch = async () => { downloads++; throw Error('unexpected download'); };
const dir = fileURLToPath(new URL('./runtime', import.meta.url));
assert.equal(await verify(dir), true);
for (let attempt = 0; attempt < 2; attempt++) {
  await ensure({ dir, ${platform === 'win32' ? "platform: 'win32', arch: 'x64'," : ''} runner: { run: async () => { throw Error('unexpected extraction'); } } });
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
  30_000,
);
