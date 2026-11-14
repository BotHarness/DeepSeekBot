import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';
import { pnpmCommand } from './dev-package-manager.mjs';

const marker = '.botharness-copy-imports.json';
const policy = { version: 1, packageImportMethod: 'copy' };

function copyImportState(directory) {
  try {
    const saved = JSON.parse(readFileSync(join(directory, marker), 'utf8'));
    if (saved.version === policy.version && saved.packageImportMethod === 'copy') {
      if (saved.state === 'complete') return 'complete';
      if (saved.state === 'installing')
        throw new Error(
          'isolated-imports-required: the previous copy installation did not complete; preserve this Home and choose a fresh --home.',
        );
    }
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    if (error.message.startsWith('isolated-imports-required:')) throw error;
  }
  throw new Error(
    'isolated-imports-required: invalid copy-import ownership record; preserve this Home and choose a fresh --home.',
  );
}

function refuseLegacyUpdate() {
  throw new Error(
    'isolated-imports-required: changing legacy dependencies requires a fresh --home. Existing files are preserved; do not reinstall or unlink them while other Hosts may share their files.',
  );
}

export function assertCopyImports(directory) {
  const state = copyImportState(directory);
  if (!existsSync(join(directory, 'node_modules')) || state === 'complete') return;
  refuseLegacyUpdate();
}

export function reuseLegacyDependencies(directory, expectedManifest) {
  const state = copyImportState(directory);
  if (!existsSync(join(directory, 'node_modules')) || state === 'complete') return false;
  const installed = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  if (!isDeepStrictEqual(installed, expectedManifest)) refuseLegacyUpdate();
  let importer;
  try {
    importer = parse(readFileSync(join(directory, 'node_modules', '.pnpm', 'lock.yaml'), 'utf8'))
      ?.importers?.['.'];
  } catch {
    refuseLegacyUpdate();
  }
  if (!importer) refuseLegacyUpdate();
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const specifiers = Object.fromEntries(
      Object.entries(importer[field] ?? {}).map(([name, entry]) => [name, entry?.specifier]),
    );
    if (!isDeepStrictEqual(specifiers, expectedManifest[field] ?? {})) refuseLegacyUpdate();
  }
  return true;
}

export async function installCopyDependencies(directory, run) {
  assertCopyImports(directory);
  const [command, args] = pnpmCommand(['install', '--package-import-method=copy']);
  writeFileSync(join(directory, marker), `${JSON.stringify({ ...policy, state: 'installing' })}\n`);
  await run(command, args, { cwd: directory });
  writeFileSync(join(directory, marker), `${JSON.stringify({ ...policy, state: 'complete' })}\n`);
}
