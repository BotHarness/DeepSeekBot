import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { removeShared, sharedRoot, splitOutDir } from '../tsgo-once.mjs';

const SHIM = join(import.meta.dirname, '..', 'tsgo-once.mjs');

function fakeTsgo(dir, exitCode) {
  const path = join(dir, 'fake-tsgo.mjs');
  writeFileSync(
    path,
    `#!/usr/bin/env node
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
const outDir = args[args.indexOf('--outDir') + 1];
appendFileSync(${JSON.stringify(join(dir, 'runs'))}, 'run\\n');
mkdirSync(join(outDir, 'pkg'), { recursive: true });
writeFileSync(join(outDir, 'pkg', 'index.d.ts'), 'export {};');
process.stderr.write('fake tsgo diagnostics\\n');
setTimeout(() => process.exit(${exitCode}), 300);
`,
  );
  chmodSync(path, 0o755);
  return path;
}

function runShim(args, env) {
  return new Promise((resolve) => {
    const child = spawn(SHIM, args, {
      env: { ...process.env, ...env },
      shell: false,
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

const tsgoArgs = (outDir) => ['--emitDeclarationOnly', '-p', 'tsconfig.json', '--outDir', outDir];

describe.skipIf(process.platform === 'win32')('tsgo-once', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tsgo-once-test-'));
    removeShared(process.pid);
  });
  afterEach(() => {
    removeShared(process.pid);
    rmSync(dir, { recursive: true, force: true });
  });

  it('runs tsgo once for concurrent calls and gives each its own output', async () => {
    const env = { BOTHARNESS_TSGO_REAL: fakeTsgo(dir, 0) };
    const outDirs = [1, 2, 3, 4].map((n) => join(dir, `out-${n}`));
    for (const outDir of outDirs) mkdirSync(outDir);
    const results = await Promise.all(outDirs.map((outDir) => runShim(tsgoArgs(outDir), env)));
    expect(results.map((result) => result.code)).toEqual([0, 0, 0, 0]);
    expect(readFileSync(join(dir, 'runs'), 'utf8')).toBe('run\n');
    for (const outDir of outDirs)
      expect(readFileSync(join(outDir, 'pkg', 'index.d.ts'), 'utf8')).toBe('export {};');
    expect(
      results.filter((result) => result.stderr.includes('fake tsgo diagnostics')),
    ).toHaveLength(1);
  });

  it('fails every caller when the shared emit fails', async () => {
    const env = { BOTHARNESS_TSGO_REAL: fakeTsgo(dir, 2) };
    const results = await Promise.all(
      [1, 2].map((n) => runShim(tsgoArgs(join(dir, `out-${n}`)), env)),
    );
    expect(results.map((result) => result.code)).toEqual([2, 2]);
    expect(results.some((result) => result.stderr.includes('shared declaration emit failed'))).toBe(
      true,
    );
  });

  it('stops waiting when the emitting process is gone', async () => {
    const args = tsgoArgs(join(dir, 'out'));
    const base = join(sharedRoot(process.pid), splitOutDir(args).key);
    mkdirSync(base, { recursive: true });
    const gone = spawn(process.execPath, ['-e', ''], { shell: false, windowsHide: true });
    await new Promise((resolve) => gone.on('close', resolve));
    writeFileSync(join(base, 'owner'), String(gone.pid));
    const result = await runShim(args, { BOTHARNESS_TSGO_REAL: fakeTsgo(dir, 0) });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('exited without a result');
  });

  it('keys shared emits by every argument except the output directory', () => {
    expect(splitOutDir(tsgoArgs('/a')).key).toBe(splitOutDir(tsgoArgs('/b')).key);
    expect(splitOutDir(['--declarationMap', ...tsgoArgs('/a')]).key).not.toBe(
      splitOutDir(tsgoArgs('/a')).key,
    );
    expect(() => splitOutDir(['-p', 'tsconfig.json'])).toThrow('missing --outDir');
  });
});
