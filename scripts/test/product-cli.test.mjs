import { execFile } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { build } from 'tsdown';
import { expect, it } from 'vitest';
import { coreCliBundleOptions } from '../../tsdown.config.ts';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const coreRequire = createRequire(new URL('../../packages/core/package.json', import.meta.url));

it('starts the shipped CLI entry outside DSH without Host-only packages', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'bh-product-cli-'));
  try {
    const core = join(temporary, 'node_modules', '@botharness', 'core');
    mkdirSync(core, { recursive: true });
    writeFileSync(
      join(core, 'package.json'),
      JSON.stringify({
        name: '@botharness/core',
        version: '9.8.7-test.1',
        type: 'module',
        exports: { './cli': './cli/index.mjs' },
      }),
    );
    const manifest = JSON.parse(
      readFileSync(new URL('../../packages/core/package.json', import.meta.url), 'utf8'),
    );
    expect(manifest.files).toContain('skills');
    cpSync(join(root, 'packages/core/skills'), join(core, 'skills'), { recursive: true });
    mkdirSync(join(temporary, 'node_modules', '@resvg'), { recursive: true });
    symlinkSync(
      dirname(coreRequire.resolve('@resvg/resvg-js/package.json')),
      join(temporary, 'node_modules', '@resvg', 'resvg-js'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await build({ ...coreCliBundleOptions, config: false, cwd: root, outDir: join(core, 'cli') });
    const entry = join(temporary, 'deepseekbot.mjs');
    writeFileSync(
      entry,
      readFileSync(new URL('../../packages/deepseekbot/src/deepseekbot.mjs', import.meta.url)),
    );
    const help = await exec(process.execPath, [entry, '--help'], { timeout: 20_000 });
    expect(help.stdout).toContain('channel-media-download');
    expect(help.stdout).toContain('channel-media-target');
    const list = await exec(process.execPath, [entry, 'skills', 'list'], {
      cwd: temporary,
      timeout: 20_000,
    });
    expect(JSON.parse(list.stdout)).toMatchObject({
      packageName: '@botharness/core',
      packageVersion: '9.8.7-test.1',
      skills: expect.arrayContaining([expect.objectContaining({ id: 'avatar-management' })]),
    });
    const shown = await exec(process.execPath, [entry, 'skills', 'show', 'avatar-management'], {
      cwd: temporary,
      timeout: 20_000,
    });
    expect(JSON.parse(shown.stdout)).toMatchObject({
      packageVersion: '9.8.7-test.1',
      skill: { id: 'avatar-management', body: expect.stringContaining('5 MB (5,000,000 bytes)') },
    });
    rmSync(join(core, 'skills'), { recursive: true });
    const missing = await exec(process.execPath, [entry, 'skills', 'show', 'avatar-management'], {
      cwd: temporary,
      timeout: 20_000,
    }).catch((error) => error);
    expect(JSON.parse(missing.stdout).error.code).toBe('skills-unavailable');
    writeFileSync(
      join(core, 'package.json'),
      JSON.stringify({
        name: '@botharness/core',
        version: null,
        type: 'module',
        exports: { './cli': './cli/index.mjs' },
      }),
    );
    const invalidMetadata = await exec(process.execPath, [entry, 'skills', 'list'], {
      cwd: temporary,
      timeout: 20_000,
    }).catch((error) => error);
    expect(JSON.parse(invalidMetadata.stdout).error.code).toBe('skills-unavailable');
    const output = await exec(process.execPath, [entry, 'channel-media-download', 'channel'], {
      timeout: 20_000,
    }).catch((error) => error);
    expect(JSON.parse(output.stdout).error.code).toBe('usage');
    expect(output.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}, 60_000);
