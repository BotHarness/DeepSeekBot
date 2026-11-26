import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const wrapper = fileURLToPath(new URL('../ci-with-deadline.mjs', import.meta.url));

function run(attempts, code, ...args) {
  const result = spawnSync(
    process.execPath,
    [wrapper, '1', attempts, process.execPath, '-e', code, ...args],
    {
      encoding: 'utf8',
      timeout: 8000,
      shell: false,
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  return result;
}

describe.skipIf(process.platform !== 'linux')('CI command deadlines', () => {
  it('prints diagnostics, stops detached processes and retries a timed-out command', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ci-with-deadline-'));
    try {
      const result = run(
        '2',
        `
        const { spawn } = require('node:child_process');
        const { existsSync, readFileSync, writeFileSync } = require('node:fs');
        const [path] = process.argv.slice(1);
        if (existsSync(path)) {
          const pid = readFileSync(path, 'utf8');
          const stat = \`/proc/\${pid}/stat\`;
          if (existsSync(stat) && !readFileSync(stat, 'utf8').includes(') Z ')) process.exit(42);
          process.stdout.write('second attempt completed');
        } else {
          const child = spawn(process.execPath, [
            '-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)', 'private-argument',
          ], { detached: true, stdio: 'ignore', shell: false, windowsHide: true });
          child.unref();
          writeFileSync(path, String(child.pid));
          setInterval(() => {}, 1000);
        }
      `,
        join(directory, 'pid'),
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe('second attempt completed');
      expect(result.stderr).toMatch(/PPID\s+PGID/);
      expect(result.stderr).toContain('open file descriptors');
      expect(result.stderr).toContain('CI timeout: attempt 1/2 exceeded 1s');
      expect(result.stderr).toContain('CI retry: starting one more attempt after timeout');
      expect(result.stderr).toContain('CI attempt 2/2');
      expect(result.stderr).not.toContain('private-argument');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('propagates a command failure immediately even if its exit code matches a timeout', () => {
    const result = run('2', 'process.exitCode = 124');
    expect(result.status).toBe(124);
    expect(result.stderr).toBe('CI attempt 1/2: 1s deadline\n');
  });

  it.each(['1', '2'])(
    'fails after exhausting %s attempt(s)',
    (attempts) => {
      const result = run(attempts, 'setInterval(() => {}, 1000)');
      expect(result.status).toBe(124);
      expect(result.stderr).toContain(`CI timeout: attempt ${attempts}/${attempts} exceeded 1s`);
      expect(result.stderr.match(/CI retry:/g)?.length ?? 0).toBe(Number(attempts) - 1);
    },
    10_000,
  );
});
