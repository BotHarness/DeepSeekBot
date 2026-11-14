import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertCopyImports,
  installCopyDependencies,
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
