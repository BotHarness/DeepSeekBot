import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDiagnosticRedactor } from '../packages/core/src/diagnostics/redaction.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function previewLogEvents(log) {
  const redactor = createDiagnosticRedactor({ homes: [] });
  return log
    .split('\n')
    .flatMap((line) => {
      const match = /genui-preview\s+(\{.*\})/u.exec(line);
      if (!match) return [];
      try {
        const event = JSON.parse(match[1]);
        if (
          !['starting', 'ready', 'completed', 'refused', 'stopped'].includes(event.phase) ||
          !Number.isFinite(event.durationMs)
        )
          return [];
        return [
          redactor.value({
            phase: event.phase,
            durationMs: event.durationMs,
            ...(typeof event.reason === 'string' ? { reason: event.reason } : {}),
            ...(typeof event.detail === 'string'
              ? { detail: redactor.text(event.detail).slice(-4096) }
              : {}),
          }),
        ];
      } catch {
        return [];
      }
    })
    .slice(-128);
}

async function main() {
  const [action, outArg, instanceArg] = process.argv.slice(2);
  if (!outArg) throw new Error('Specify environment <out> or logs <out> <instance.json>');
  const out = resolve(outArg);
  mkdirSync(dirname(out), { recursive: true });
  if (action === 'logs') {
    const instance = JSON.parse(readFileSync(resolve(instanceArg), 'utf8'));
    const events = previewLogEvents(readFileSync(instance.log, 'utf8'));
    writeFileSync(out, JSON.stringify({ events, rawLogPublished: false }, null, 2) + '\n');
    return;
  }
  if (action !== 'environment') throw new Error('Unknown diagnostics action');
  const { discoverBrowserBinary } = await import('../packages/browser/dist/index.mjs');
  const store = join(root, 'node_modules/.pnpm');
  const entry = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
  if (!entry) throw new Error('Puppeteer dependency unavailable');
  const puppeteer = createRequire(join(store, entry, 'node_modules/'))('puppeteer');
  const system = discoverBrowserBinary();
  if (!system) throw new Error('System preview browser unavailable');
  const inspect = (path) => ({
    path,
    realpath: realpathSync(path),
    version: execFileSync(path, ['--version'], {
      encoding: 'utf8',
      timeout: 8000,
      windowsHide: true,
      shell: false,
    }).trim(),
  });
  const result = {
    observedAt: new Date().toISOString(),
    node: process.version,
    imageOS: process.env.ImageOS ?? null,
    imageVersion: process.env.ImageVersion ?? null,
    system: inspect(system),
    controlled: inspect(await puppeteer.executablePath()),
  };
  if (existsSync(out)) throw new Error('Keep prior environment evidence; choose a new file');
  writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
