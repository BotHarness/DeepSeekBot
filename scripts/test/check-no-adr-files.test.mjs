import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../check-no-adr-files.mjs', import.meta.url));
const run = (directory) =>
  spawnSync(process.execPath, [script, directory], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });

describe('numbered ADR file policy', () => {
  it('passes when docs/adr is absent or empty', () => {
    const root = mkdtempSync(join(tmpdir(), 'adr-'));
    expect(run(join(root, 'docs/adr')).status).toBe(0);
    mkdirSync(join(root, 'docs/adr'), { recursive: true });
    expect(run(join(root, 'docs/adr')).status).toBe(0);
  });

  it('refuses a new numbered ADR and points at docs/decisions', () => {
    const root = mkdtempSync(join(tmpdir(), 'adr-'));
    mkdirSync(join(root, 'docs/adr'), { recursive: true });
    writeFileSync(join(root, 'docs/adr/0366-managing-the-app-is-a-grant.md'), '# ADR\n');
    const result = run(join(root, 'docs/adr'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('docs/adr/0366-managing-the-app-is-a-grant.md [no-adr-files]');
    expect(result.stderr).toContain('docs/decisions/<topic>.md');
  });
});
