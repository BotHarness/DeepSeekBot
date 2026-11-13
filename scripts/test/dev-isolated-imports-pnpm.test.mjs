import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  existsSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { pnpmCommand } from '../dev-package-manager.mjs';
import { installCopyDependencies } from '../dev-isolated-imports.mjs';
import { dshCommand } from '../dev-instance.mjs';
import { fileURLToPath } from 'node:url';

const { packageManager } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

it('native default Profile config export creates no dependency installation', () => {
  const home = mkdtempSync(join(tmpdir(), 'bh-native-init-proof-'));
  try {
    const [command, cli] = dshCommand(fileURLToPath(new URL('../../', import.meta.url)));
    execFileSync(
      command,
      [cli, '--profile', 'copy-proof', '--from-default-profile', 'web', '--dump-config'],
      {
        env: { ...process.env, DSH_HOME: home },
        encoding: 'utf8',
        windowsHide: true,
        shell: false,
        timeout: 30_000,
      },
    );
    const profile = join(home, 'profiles', 'copy-proof');
    expect(existsSync(join(profile, 'package.json'))).toBe(true);
    expect(existsSync(join(profile, 'pnpm-workspace.yaml'))).toBe(true);
    expect(existsSync(join(profile, 'node_modules'))).toBe(false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}, 45_000);

function pnpm(cwd, args) {
  const [command, argv] = pnpmCommand(args);
  return execFileSync(command, argv, { cwd, encoding: 'utf8', windowsHide: true, shell: false });
}

function snapshot(path) {
  const info = statSync(path);
  return {
    ino: info.ino,
    dev: info.dev,
    nlink: info.nlink,
    mtimeMs: info.mtimeMs,
    ctimeMs: info.ctimeMs,
    sha: createHash('sha256').update(readFileSync(path)).digest('hex'),
  };
}

it('real offline pnpm copy imports isolate executable files and leave legacy hardlinks unchanged', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bh-pnpm-copy-proof-'));
  try {
    const pkg = join(root, 'package');
    mkdirSync(pkg);
    writeFileSync(
      join(pkg, 'package.json'),
      JSON.stringify({
        name: 'bh-copy-proof',
        version: '1.0.0',
        files: ['client.js'],
        packageManager,
      }),
    );
    writeFileSync(join(pkg, 'client.js'), 'export const nativeClient = true;\n');
    pnpm(pkg, ['pack', '--pack-destination', root]);
    const archive = join(root, 'bh-copy-proof-1.0.0.tgz');
    const store = join(root, 'store');
    async function install(name, method) {
      const home = join(root, name);
      mkdirSync(home, { recursive: true });
      writeFileSync(
        join(home, 'package.json'),
        JSON.stringify({
          name,
          private: true,
          packageManager,
          dependencies: { 'bh-copy-proof': `file:${archive.replaceAll('\\', '/')}` },
        }),
      );
      const flags = ['--offline', '--ignore-scripts', '--store-dir', store];
      if (method === 'copy')
        await installCopyDependencies(home, async (command, args, options) => {
          execFileSync(command, [...args, ...flags], {
            ...options,
            encoding: 'utf8',
            windowsHide: true,
            shell: false,
          });
        });
      else pnpm(home, ['install', ...flags, `--package-import-method=${method}`]);
      return realpathSync(join(home, 'node_modules', 'bh-copy-proof', 'client.js'));
    }
    const first = await install('first', 'copy');
    const before = snapshot(first);
    const second = await install('second', 'copy');
    const other = snapshot(second);
    expect(snapshot(first)).toEqual(before);
    expect(before.sha).toBe(other.sha);
    expect([before.dev, before.ino]).not.toEqual([other.dev, other.ino]);
    expect(before.nlink).toBe(1);
    expect(other.nlink).toBe(1);

    const legacy = await install('legacy', 'hardlink');
    const legacyBefore = snapshot(legacy);
    expect(legacyBefore.nlink).toBeGreaterThan(1);
    pnpm(join(root, 'legacy'), [
      'install',
      '--offline',
      '--ignore-scripts',
      '--store-dir',
      store,
      '--package-import-method=copy',
    ]);
    expect(snapshot(legacy)).toEqual(legacyBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 90_000);
