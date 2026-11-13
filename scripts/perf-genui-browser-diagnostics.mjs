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
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDiagnosticRedactor } from '../packages/core/src/diagnostics/redaction.ts';
import { cookieFor } from './verify-app.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function controlledBrowserPath() {
  const store = join(root, 'node_modules/.pnpm');
  const entry = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
  if (!entry) throw new Error('Puppeteer dependency unavailable');
  const puppeteer = createRequire(join(store, entry, 'node_modules/'))('puppeteer');
  return realpathSync(await puppeteer.executablePath());
}

export function previewBrowserAppArmorProfile(binary) {
  if (!isAbsolute(binary) || /[\p{Cc}*?\[\]{}"\\^]/u.test(binary))
    throw new Error('AppArmor preview selection requires one literal absolute executable path');
  return `abi <abi/4.0>,
include <tunables/global>
profile botharness-ci-genui-preview "${binary}" flags=(unconfined) {
  userns,
}
`;
}

export function probeBrowserVersion(browser, run = execFileSync) {
  const redactor = createDiagnosticRedactor({ homes: [] });
  try {
    return {
      ...browser,
      version: run(browser.path, ['--version'], {
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true,
        shell: false,
      }).trim(),
      probe: { outcome: 'success' },
    };
  } catch (error) {
    return {
      ...browser,
      probe: {
        outcome: 'failed',
        code: typeof error.code === 'string' ? error.code : 'unknown',
        pid: typeof error.pid === 'number' ? error.pid : null,
        status: typeof error.status === 'number' ? error.status : null,
        signal: typeof error.signal === 'string' ? error.signal : null,
        stderr: redactor.text(String(error.stderr ?? '')).slice(-2048),
        stdout: redactor.text(String(error.stdout ?? '')).slice(-512),
      },
    };
  }
}

export function previewDiagnosticEvents(report) {
  const redactor = createDiagnosticRedactor({ homes: [] });
  const entries = Array.isArray(report?.entries) ? report.entries : [];
  return entries
    .flatMap((entry) => {
      if (
        entry?.source !== 'genui-preview' ||
        !/^(?:starting|ready|completed|refused|stopped)(?:-detail)?$/u.test(entry.code) ||
        !Number.isFinite(entry.fields?.durationMs)
      )
        return [];
      const fields = Object.fromEntries(
        ['durationMs', 'reason', 'detailChunks', 'detailTruncated', 'index', 'text']
          .filter((key) => ['string', 'number', 'boolean'].includes(typeof entry.fields[key]))
          .map((key) => [key, entry.fields[key]]),
      );
      return [redactor.value({ phase: entry.code, ...fields })];
    })
    .slice(0, 128);
}

async function main() {
  const [action, outArg, instanceArg] = process.argv.slice(2);
  if (action === 'path') {
    console.log(await controlledBrowserPath());
    return;
  }
  if (!outArg) throw new Error('Specify environment <out> or logs <out> <instance.json>');
  const out = resolve(outArg);
  mkdirSync(dirname(out), { recursive: true });
  if (action === 'apparmor') {
    writeFileSync(out, previewBrowserAppArmorProfile(await controlledBrowserPath()), {
      flag: 'wx',
    });
    return;
  }
  if (action === 'logs') {
    const instance = JSON.parse(readFileSync(resolve(instanceArg), 'utf8'));
    const since = Date.parse(instance.startedAt);
    if (!Number.isFinite(since))
      throw new Error('Host launch timestamp is required for scoped diagnostics');
    const url = new URL('/api/botharness/diagnostic-logs', instance.url);
    url.search = new URLSearchParams({
      filter: 'all',
      limit: '1000',
      since: String(since),
    }).toString();
    const response = await fetch(url, {
      headers: { cookie: cookieFor(instance.home), connection: 'close' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Preview owner diagnostic query failed');
    const report = await response.json();
    const events = previewDiagnosticEvents(report);
    writeFileSync(
      out,
      JSON.stringify(
        {
          events,
          completeness: {
            primary: report.completeness?.primary === 'available' ? 'available' : 'unavailable',
            truncated:
              typeof report.completeness?.truncated === 'boolean'
                ? report.completeness.truncated
                : null,
          },
          rawLogPublished: false,
        },
        null,
        2,
      ) + '\n',
    );
    if (!events.length || report.completeness?.primary !== 'available')
      throw new Error(
        'Preview owner diagnostics are missing or unavailable; retain incomplete evidence',
      );
    return;
  }
  if (action !== 'environment') throw new Error('Unknown diagnostics action');
  const { discoverBrowserBinary } = await import('../packages/browser/dist/index.mjs');
  const system = discoverBrowserBinary();
  if (!system) throw new Error('System preview browser unavailable');
  const inspect = (path) => ({
    path,
    realpath: realpathSync(path),
  });
  const result = {
    observedAt: new Date().toISOString(),
    node: process.version,
    imageOS: process.env.ImageOS ?? null,
    imageVersion: process.env.ImageVersion ?? null,
    system: inspect(system),
    controlled: inspect(await controlledBrowserPath()),
  };
  if (existsSync(out)) throw new Error('Keep prior environment evidence; choose a new file');
  const save = () => writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  save();
  let failed = false;
  for (const key of ['system', 'controlled']) {
    result[key] = probeBrowserVersion(result[key]);
    failed ||= result[key].probe.outcome !== 'success';
    save();
  }
  if (failed)
    throw new Error('Browser version probe failed; bounded process evidence was retained');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
