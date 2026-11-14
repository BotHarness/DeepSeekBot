import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertCopyImports,
  installCopyDependencies,
  recoverInterruptedCopyDependencies,
  reuseLegacyDependencies,
} from '../dev-isolated-imports.mjs';

const homes = [];
function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'bh-copy-imports-'));
  homes.push(home);
  return home;
}
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

describe('explicit interrupted copy recovery', () => {
  function interrupted() {
    const home = fixture();
    const directory = join(home, 'ax-cli');
    mkdirSync(join(directory, 'node_modules'), { recursive: true });
    writeFileSync(join(directory, 'node_modules', 'client.js'), 'original executable');
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'retained' }));
    writeFileSync(
      join(directory, '.botharness-copy-imports.json'),
      JSON.stringify({ version: 1, packageImportMethod: 'copy', state: 'installing' }),
    );
    return { home, directory };
  }

  it('retains the interrupted tree before a fresh successful copy installation', async () => {
    const { home, directory } = interrupted();
    const recovery = recoverInterruptedCopyDependencies(directory, { home });
    expect(readFileSync(join(recovery.quarantine, 'node_modules', 'client.js'), 'utf8')).toBe(
      'original executable',
    );
    expect(
      JSON.parse(readFileSync(join(recovery.quarantine, '.botharness-copy-imports.json'))).state,
    ).toBe('installing');
    expect(existsSync(join(directory, 'node_modules'))).toBe(false);
    expect(reuseLegacyDependencies(directory, {})).toBe(false);
    await installCopyDependencies(directory, async (_command, args) => {
      expect(args).toContain('--package-import-method=copy');
      mkdirSync(join(directory, 'node_modules'));
      writeFileSync(join(directory, 'node_modules', 'client.js'), 'recovered executable');
    });
    expect(JSON.parse(readFileSync(join(directory, '.botharness-copy-imports.json'))).state).toBe(
      'complete',
    );
    expect(readFileSync(join(recovery.quarantine, 'node_modules', 'client.js'), 'utf8')).toBe(
      'original executable',
    );
  });

  it('preserves successive quarantines and never claims a failed install completed', async () => {
    const { home, directory } = interrupted();
    const first = recoverInterruptedCopyDependencies(directory, { home });
    await expect(
      installCopyDependencies(directory, async () => {
        mkdirSync(join(directory, 'node_modules'));
        writeFileSync(join(directory, 'node_modules', 'partial'), 'second attempt');
        throw Error('interrupted again');
      }),
    ).rejects.toThrow('interrupted again');
    expect(() => assertCopyImports(directory)).toThrow('did not complete');
    const second = recoverInterruptedCopyDependencies(directory, { home });
    expect(second.quarantine).not.toBe(first.quarantine);
    expect(readFileSync(join(first.quarantine, 'node_modules', 'client.js'), 'utf8')).toBe(
      'original executable',
    );
    expect(readFileSync(join(second.quarantine, 'node_modules', 'partial'), 'utf8')).toBe(
      'second attempt',
    );
  });

  it('refuses an installation outside the named Home', () => {
    const { home, directory } = interrupted();
    expect(() => recoverInterruptedCopyDependencies(directory, { home: fixture() })).toThrow(
      'copy-recovery-path-refused',
    );
    expect(existsSync(join(directory, 'node_modules', 'client.js'))).toBe(true);
    expect(() => recoverInterruptedCopyDependencies(home, { home })).toThrow(
      'copy-recovery-path-refused',
    );
  });

  it('refuses a dependency junction without following or modifying its target', () => {
    const { home, directory } = interrupted();
    rmSync(join(directory, 'node_modules'), { recursive: true });
    const external = fixture();
    writeFileSync(join(external, 'keep'), 'external');
    symlinkSync(external, join(directory, 'node_modules'), 'junction');
    expect(() => recoverInterruptedCopyDependencies(directory, { home })).toThrow(
      'copy-recovery-path-refused',
    );
    expect(readFileSync(join(external, 'keep'), 'utf8')).toBe('external');
  });

  it('refuses aliased installation parents and shared ownership records', () => {
    const { home, directory } = interrupted();
    const aliasHome = fixture();
    symlinkSync(directory, join(aliasHome, 'ax-cli'), 'junction');
    expect(() =>
      recoverInterruptedCopyDependencies(join(aliasHome, 'ax-cli'), { home: aliasHome }),
    ).toThrow('copy-recovery-path-refused');
    const record = join(directory, '.botharness-copy-imports.json');
    const observer = join(home, 'marker-observer');
    linkSync(record, observer);
    const before = readFileSync(observer, 'utf8');
    expect(() => recoverInterruptedCopyDependencies(directory, { home })).toThrow(
      'copy-recovery-record-refused',
    );
    expect(readFileSync(observer, 'utf8')).toBe(before);
    expect(existsSync(join(directory, 'node_modules', 'client.js'))).toBe(true);
  });

  it('refuses malformed markers and does not migrate unmarked legacy dependencies', () => {
    const { home, directory } = interrupted();
    writeFileSync(join(directory, '.botharness-copy-imports.json'), '{}');
    expect(() => recoverInterruptedCopyDependencies(directory, { home })).toThrow(
      'invalid copy-import',
    );
    rmSync(join(directory, '.botharness-copy-imports.json'));
    expect(recoverInterruptedCopyDependencies(directory, { home })).toBeUndefined();
    expect(existsSync(join(directory, 'node_modules', 'client.js'))).toBe(true);
  });

  it('refuses a dangling dependency junction after quarantine before any installer runs', async () => {
    const { home, directory } = interrupted();
    recoverInterruptedCopyDependencies(directory, { home });
    symlinkSync(join(home, 'absent-target'), join(directory, 'node_modules'), 'junction');
    const run = vi.fn();
    await expect(installCopyDependencies(directory, run)).rejects.toThrow(
      'isolated-imports-required',
    );
    expect(run).not.toHaveBeenCalled();
    expect(existsSync(join(home, 'absent-target'))).toBe(false);
  });

  it('does not treat a missing recorded quarantine as a fresh unmarked installation', async () => {
    const { home, directory } = interrupted();
    const recovery = recoverInterruptedCopyDependencies(directory, { home });
    rmSync(recovery.quarantine, { recursive: true });
    const run = vi.fn();
    await expect(installCopyDependencies(directory, run)).rejects.toThrow('invalid copy-import');
    expect(run).not.toHaveBeenCalled();
    expect(existsSync(join(directory, 'node_modules'))).toBe(false);
  });
});

describe('isolated dependency ownership', () => {
  it('allows an unchanged legacy manifest to restart without installing or marking it', () => {
    const home = fixture();
    mkdirSync(join(home, 'node_modules'));
    mkdirSync(join(home, 'node_modules', '.pnpm'));
    writeFileSync(
      join(home, 'node_modules', '.pnpm', 'lock.yaml'),
      stringify({
        importers: {
          '.': { dependencies: { bot: { specifier: 'link:original', version: 'link:original' } } },
        },
      }),
    );
    writeFileSync(
      join(home, 'package.json'),
      JSON.stringify({ name: 'legacy', dependencies: { bot: 'link:original' } }),
    );
    expect(
      reuseLegacyDependencies(home, { dependencies: { bot: 'link:original' }, name: 'legacy' }),
    ).toBe(true);
    expect(() =>
      reuseLegacyDependencies(home, {
        name: 'legacy',
        dependencies: { bot: 'link:other-worktree' },
      }),
    ).toThrow('fresh --home');
    expect(existsSync(join(home, '.botharness-copy-imports.json'))).toBe(false);
    expect(JSON.parse(readFileSync(join(home, 'package.json'), 'utf8')).dependencies.bot).toBe(
      'link:original',
    );
  });
  it('refuses an edited manifest that no longer matches the installed importer without modifying files', () => {
    const home = fixture();
    const manifest = { dependencies: { bot: 'link:new-worktree' } };
    mkdirSync(join(home, 'node_modules', '.pnpm'), { recursive: true });
    const installed = stringify({
      importers: {
        '.': {
          dependencies: {
            bot: {
              specifier: 'link:old-worktree',
              version: 'link:old-worktree',
            },
          },
        },
      },
    });
    const lock = join(home, 'node_modules', '.pnpm', 'lock.yaml');
    writeFileSync(lock, installed);
    writeFileSync(join(home, 'package.json'), JSON.stringify(manifest));
    expect(() => reuseLegacyDependencies(home, manifest)).toThrow('isolated-imports-required');
    expect(readFileSync(lock, 'utf8')).toBe(installed);
    expect(readFileSync(join(home, 'package.json'), 'utf8')).toBe(JSON.stringify(manifest));
    expect(existsSync(join(home, '.botharness-copy-imports.json'))).toBe(false);
  });
  it('refuses legacy dependencies before invoking pnpm or changing files', async () => {
    const home = fixture();
    mkdirSync(join(home, 'node_modules'));
    const executable = join(home, 'node_modules', 'client.js');
    writeFileSync(executable, 'live artifact');
    const run = vi.fn();
    await expect(installCopyDependencies(home, run)).rejects.toThrow('isolated-imports-required');
    expect(run).not.toHaveBeenCalled();
    expect(readFileSync(executable, 'utf8')).toBe('live artifact');
    expect(existsSync(join(home, '.botharness-copy-imports.json'))).toBe(false);
  });

  it('records ownership only after a successful copy-mode install and permits reuse', async () => {
    const home = fixture();
    const run = vi.fn(async (_command, args, options) => {
      expect(args).toContain('--package-import-method=copy');
      expect(options.cwd).toBe(home);
      expect(
        JSON.parse(readFileSync(join(home, '.botharness-copy-imports.json'), 'utf8')).state,
      ).toBe('installing');
      mkdirSync(join(home, 'node_modules'));
    });
    await installCopyDependencies(home, run);
    expect(() => assertCopyImports(home)).not.toThrow();
    const again = vi.fn(async () => {});
    await installCopyDependencies(home, again);
    expect(again).toHaveBeenCalledOnce();
  });

  it('preserves partial installation after failure and refuses implicit repair', async () => {
    const home = fixture();
    const manifest = { name: 'partial', private: true };
    writeFileSync(join(home, 'package.json'), JSON.stringify(manifest));
    await expect(
      installCopyDependencies(home, async () => {
        mkdirSync(join(home, 'node_modules'));
        throw new Error('installation interrupted');
      }),
    ).rejects.toThrow('installation interrupted');
    expect(() => assertCopyImports(home)).toThrow('isolated-imports-required');
    expect(() => reuseLegacyDependencies(home, manifest)).toThrow('did not complete');
    expect(existsSync(join(home, 'node_modules'))).toBe(true);
  });
});
