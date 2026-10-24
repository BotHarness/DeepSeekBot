import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
      JSON.stringify({ type: 'module', exports: { './cli': './cli/index.mjs' } }),
    );
    mkdirSync(join(temporary, 'node_modules', '@resvg'), { recursive: true });
    symlinkSync(
      dirname(coreRequire.resolve('@resvg/resvg-js/package.json')),
      join(temporary, 'node_modules', '@resvg', 'resvg-js'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    symlinkSync(
      dirname(coreRequire.resolve('css-tree/package.json')),
      join(temporary, 'node_modules', 'css-tree'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await build({ ...coreCliBundleOptions, config: false, cwd: root, outDir: join(core, 'cli') });
    const entry = join(temporary, 'deepseekbot.mjs');
    await build({
      config: false,
      cwd: root,
      entry: { deepseekbot: 'packages/deepseekbot/src/deepseekbot.mjs' },
      outDir: temporary,
      format: ['esm'],
      platform: 'node',
      deps: { neverBundle: ['@botharness/core/cli'] },
      dts: false,
      clean: false,
    });
    const help = await exec(process.execPath, [entry, '--help'], { timeout: 20_000 });
    expect(help.stdout).toContain('channel-media-download');
    expect(help.stdout).toContain('channel-media-target');
    const output = await exec(process.execPath, [entry, 'channel-media-download', 'channel'], {
      timeout: 20_000,
    }).catch((error) => error);
    expect(JSON.parse(output.stdout).error.code).toBe('usage');
    expect(output.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}, 60_000);
