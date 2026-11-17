import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import plugin from '../lint-rules/botharness.mjs';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'lint-rules');

function lint(name) {
  const bin = join(
    dirname(createRequire(import.meta.url).resolve('oxlint/package.json')),
    'bin',
    'oxlint',
  );
  const result = spawnSync(
    process.execPath,
    [bin, '--format', 'json', '-c', join(fixtures, 'oxlintrc.json'), name],
    { cwd: fixtures, encoding: 'utf8', shell: false, windowsHide: true },
  );
  const { diagnostics } = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
  return diagnostics
    .sort((a, b) => a.labels[0].span.line - b.labels[0].span.line)
    .map(
      (diagnostic) => `${diagnostic.labels[0].span.line} ${diagnostic.code}: ${diagnostic.message}`,
    );
}

describe('botharness lint rules', () => {
  it('exports the rules .oxlintrc.json enables', () => {
    expect(Object.keys(plugin.rules)).toEqual(['spawn-options', 'no-api-intercept']);
  });

  it('flags a spawn without windowsHide, through a shell, or via exec', () => {
    expect(lint('spawn.mjs')).toEqual([
      '6 botharness(spawn-options): spawnSync() needs an options object with windowsHide: true.',
      '7 botharness(spawn-options): spawn() needs windowsHide: true so no console window flashes on Windows (false only for a program whose window the user should see).',
      '8 botharness(spawn-options): spawn() must not run through a shell; pass direct argv with shell: false.',
      '9 botharness(spawn-options): execFileSync() needs windowsHide: true so no console window flashes on Windows (false only for a program whose window the user should see).',
      '10 botharness(spawn-options): execSync() runs through a shell; use execFile/spawn with direct argv, shell: false and windowsHide: true.',
      '19 botharness(spawn-options): execFile() needs an options object with windowsHide: true.',
      '20 botharness(spawn-options): spawn() needs an options object with windowsHide: true.',
      '23 botharness(spawn-options): spawn() needs windowsHide: true so no console window flashes on Windows (false only for a program whose window the user should see).',
      '38 botharness(spawn-options): spawn() must not run through a shell; pass direct argv with shell: false.',
      '38 botharness(spawn-options): spawn() needs windowsHide: true so no console window flashes on Windows (false only for a program whose window the user should see).',
    ]);
  }, 30_000);

  it('flags an /api interceptor outside the API gateway', () => {
    expect(lint('intercept.mjs')).toEqual([
      "2 botharness(no-api-intercept): Do not intercept '/api'; register the route through the API gateway (dsh-dev skill, /api transport contract).",
      "5 botharness(no-api-intercept): Do not intercept '/api'; register the route through the API gateway (dsh-dev skill, /api transport contract).",
    ]);
  }, 30_000);
});
