import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';
import { pnpmCommand } from './dev-package-manager.mjs';

const marker = '.botharness-copy-imports.json';
const policy = { version: 1, packageImportMethod: 'copy' };

function pathExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function copyImportState(directory, allowInterrupted = false) {
  let text;
  try {
    text = readFileSync(join(directory, marker), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT' && !pathExists(join(directory, marker))) return undefined;
    throw error;
  }
  try {
    const saved = JSON.parse(text);
    if (saved.version === policy.version && saved.packageImportMethod === 'copy') {
      if (saved.state === 'complete') return 'complete';
      if (saved.state === 'quarantined' && !pathExists(join(directory, 'node_modules'))) {
        assertOwnedPath(directory, directory, join(directory, marker), { file: true });
        if (
          typeof saved.quarantine !== 'string' ||
          dirname(saved.quarantine) !== resolve(directory)
        )
          throw new Error('copy-recovery-path-refused');
        assertOwnedPath(directory, directory, saved.quarantine);
        return 'quarantined';
      }
      if (saved.state === 'installing' && allowInterrupted) return 'installing';
      if (saved.state === 'installing')
        throw new Error(
          'isolated-imports-required: the previous copy installation did not complete; preserve this Home and choose a fresh --home.',
        );
    }
  } catch (error) {
    if (error.message.startsWith('isolated-imports-required:')) throw error;
  }
  throw new Error(
    'isolated-imports-required: invalid copy-import ownership record; preserve this Home and choose a fresh --home.',
  );
}

function assertOwnedPath(home, directory, path, { optional = false, file = false } = {}) {
  const root = resolve(home);
  const owner = resolve(directory);
  const target = resolve(path);
  for (const [parent, child] of [
    [root, owner],
    [owner, target],
  ]) {
    const rel = relative(parent, child);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('copy-recovery-path-refused');
  }
  for (let current = target; ; current = dirname(current)) {
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (current === target && optional && error.code === 'ENOENT') continue;
      throw error;
    }
    if (stat.isSymbolicLink() || resolve(realpathSync(current)) !== current)
      throw new Error('copy-recovery-path-refused');
    if (current === target && file && (!stat.isFile() || stat.nlink !== 1))
      throw new Error('copy-recovery-record-refused');
    if (!(current === target && file) && !stat.isDirectory())
      throw new Error('copy-recovery-path-refused');
    if (current === root) break;
    if (dirname(current) === current) throw new Error('copy-recovery-path-refused');
  }
}

export function recoverInterruptedCopyDependencies(directory, { home, profile }) {
  const owner = resolve(directory);
  const allowed = [join(home, 'ax-cli'), join(home, 'packaged-cli')];
  if (typeof profile === 'string' && /^[A-Za-z0-9_-]+$/u.test(profile))
    allowed.push(join(home, 'profiles', profile));
  if (!allowed.some((path) => resolve(path) === owner))
    throw new Error('copy-recovery-path-refused');
  if (!pathExists(owner)) return undefined;
  assertOwnedPath(home, owner, owner);
  const record = join(owner, marker);
  if (pathExists(record)) assertOwnedPath(home, owner, record, { file: true });
  if (copyImportState(owner, true) !== 'installing') return undefined;
  const dependencies = join(owner, 'node_modules');
  assertOwnedPath(home, owner, dependencies, { optional: true });
  const records = [];
  for (const name of [marker, 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
    const original = join(owner, name);
    if (!pathExists(original)) continue;
    assertOwnedPath(home, owner, original, { file: true });
    records.push({ name, original });
  }
  const quarantine = join(owner, `.botharness-copy-recovery-${randomUUID()}`);
  mkdirSync(quarantine);
  assertOwnedPath(home, owner, quarantine);
  for (const { name, original } of records) copyFileSync(original, join(quarantine, name));
  const destination = join(quarantine, 'node_modules');
  const hadDependencies = existsSync(dependencies);
  writeFileSync(
    join(quarantine, 'recovery.json'),
    `${JSON.stringify({ version: 1, directory: owner, hadDependencies, startedAt: new Date().toISOString() })}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  if (hadDependencies) {
    assertOwnedPath(home, owner, dependencies);
    assertOwnedPath(home, owner, destination, { optional: true });
    if (existsSync(destination)) throw new Error('copy-recovery-target-exists');
    renameSync(dependencies, destination);
  }
  assertOwnedPath(home, owner, record, { file: true });
  writeFileSync(record, `${JSON.stringify({ ...policy, state: 'quarantined', quarantine })}\n`);
  return { directory: owner, quarantine, hadDependencies };
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
