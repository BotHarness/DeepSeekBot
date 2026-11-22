import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';

it('moves design token allowances, blocks rule growth, and writes smaller totals after a fix', () => {
  const root = mkdtempSync(join(tmpdir(), 'design-token-baseline-'));
  const oldFile = 'packages/client/src/client/a.tsx';
  const newFile = 'packages/client/src/client/b.tsx';
  const checker = 'scripts/check-design-tokens.mjs';
  const baseline = 'scripts/design-token-baseline.json';
  const rawControl = '<button className="example" />';
  const write = (file, source) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source);
  };
  const options = { cwd: root, encoding: 'utf8', shell: false, windowsHide: true };
  const env = { ...process.env };
  delete env.BASELINE_BASE;
  const run = (...args) => spawnSync(process.execPath, [checker, ...args], { ...options, env });
  const git = (...args) => execFileSync('git', args, options);
  const readBaseline = () => JSON.parse(readFileSync(join(root, baseline), 'utf8'));

  try {
    write(baseline, JSON.stringify({ [oldFile]: { rawControl: 1 } }));
    for (const script of [checker, 'scripts/baseline-counts.mjs']) {
      copyFileSync(new URL(`../../${script}`, import.meta.url), join(root, script));
    }
    git('init', '--initial-branch=main');
    git('add', baseline);
    const base = git('write-tree').trim();
    write(newFile, rawControl);

    expect(run().status).toBe(0);
    expect(run(newFile).status).toBe(0);
    expect(run('--write').status).toBe(0);
    expect(readBaseline()).toEqual({ [newFile]: { rawControl: 1 } });

    write(newFile, rawControl.repeat(2));
    for (const args of [[], ['--write']]) {
      const result = run(...args);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        `rawControl total grew from 1 to 2; counts rose in ${newFile} (1 → 2)`,
      );
    }
    expect(readBaseline()).toEqual({ [newFile]: { rawControl: 1 } });

    write(baseline, JSON.stringify({ [newFile]: { rawControl: 2 } }));
    env.BASELINE_BASE = base;
    const raised = run();
    expect(raised.status).toBe(1);
    expect(raised.stderr).toContain(
      `baseline rawControl total grew from 1 to 2; counts rose in ${newFile} (0 → 2)`,
    );

    write(baseline, JSON.stringify({ [newFile]: { rawControl: 1 } }));
    write(newFile, '');
    const fixed = run();
    expect(fixed.status).toBe(1);
    expect(fixed.stderr).toContain('rawControl total dropped from 1 to 0; shrink the baseline');
    expect(run('--write').status).toBe(0);
    expect(readBaseline()).toEqual({});
    expect(run().status).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
