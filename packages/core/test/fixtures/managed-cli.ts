import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'tsdown';

const externalDependencies = ['@resvg/resvg-js', 'silk-wasm', 'opus-decoder', 'css-tree', 'sharp'];

async function sourceTreeHash(sourceRoot: string): Promise<string> {
  const hash = createHash('sha256');
  for (const path of (await readdir(sourceRoot, { recursive: true })).sort()) {
    if (!path.endsWith('.ts') && !path.endsWith('.tsx')) continue;
    hash.update(path.replaceAll('\\', '/'));
    hash.update(await readFile(join(sourceRoot, path)));
  }
  return hash.digest('hex');
}

export async function buildManagedCliFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'botharness-managed-cli-fixture-'));
  try {
    const entry = fileURLToPath(new URL('../../src/bots/bot-create-cli.ts', import.meta.url));
    const sourceRoot = fileURLToPath(new URL('../../src', import.meta.url));
    const sourceBeforeSha256 = await sourceTreeHash(sourceRoot);
    await build({
      config: false,
      cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
      entry: { index: entry },
      outDir: join(directory, 'cli'),
      format: ['esm'],
      platform: 'node',
      dts: false,
      clean: true,
      deps: {
        alwaysBundle: [/^@deepseek-ai\//],
        neverBundle: externalDependencies,
        onlyBundle: false,
      },
      logLevel: 'silent',
    });
    await copyFile(
      fileURLToPath(new URL('../../package.json', import.meta.url)),
      join(directory, 'package.json'),
    );
    const dependencies = await realpath(
      fileURLToPath(new URL('../../node_modules/', import.meta.url)),
    );
    for (const name of externalDependencies) {
      const target = join(directory, 'node_modules', name);
      await mkdir(dirname(target), { recursive: true });
      await symlink(
        await realpath(join(dependencies, name)),
        target,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    }
    const provenance = {
      entrySha256: createHash('sha256')
        .update(await readFile(entry))
        .digest('hex'),
      sourceBeforeSha256,
      sourceAfterSha256: await sourceTreeHash(sourceRoot),
      bundleSha256: createHash('sha256')
        .update(await readFile(join(directory, 'cli', 'index.mjs')))
        .digest('hex'),
    };
    return {
      provenance,
      path: join(directory, 'cli', 'index.mjs'),
      close: () => rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    throw error;
  }
}
