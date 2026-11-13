import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

it.each([false, true])(
  'selects the pinned preview unless the system diagnostic is requested: %s',
  (diagnostic) => {
    const workflow = parse(
      readFileSync(new URL('../../.github/workflows/verify.yml', import.meta.url), 'utf8'),
    );
    const launch = workflow.jobs['perf-budget'].steps.find((step) =>
      step.run?.includes('verify-app.mjs launch --name perf --build'),
    );
    const root = mkdtempSync(join(tmpdir(), 'genui-ci-browser-'));
    const capture = join(root, 'launch.json');
    const binary = '/test/browser with spaces/chrome';
    try {
      writeFileSync(
        join(root, 'node'),
        `#!${process.execPath}
import { writeFileSync } from 'node:fs';
if (process.argv[2].endsWith('perf-genui-browser-diagnostics.mjs')) console.log(${JSON.stringify(binary)});
else writeFileSync(process.env.CAPTURE_FILE, JSON.stringify(process.argv.slice(2)));
`,
        { mode: 0o755 },
      );
      execFileSync('bash', ['-e', '-c', launch.run], {
        env: {
          ...process.env,
          PATH: `${root}:${process.env.PATH}`,
          CAPTURE_FILE: capture,
          SYSTEM_PREVIEW_DIAGNOSTIC: String(diagnostic),
        },
        stdio: 'pipe',
      });
      const args = JSON.parse(readFileSync(capture, 'utf8'));
      expect(args.includes('--genui-preview-browser')).toBe(!diagnostic);
      if (!diagnostic) expect(args.at(-1)).toBe(binary);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
