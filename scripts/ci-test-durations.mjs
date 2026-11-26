import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
export const DURATIONS_FILE = 'scripts/ci-test-durations.json';
export const MIN_RECORDED_MS = 1000;

const RESULT_LINE = /[✓×↓]\s+\S+\s+(\S+\.test\.[cm]?[jt]sx?) \(\d+ tests?[^)]*\) (\d+)ms/u;

export function parseVitestLog(text) {
  const durations = new Map();
  for (const line of text.replace(/\u001b\[[0-9;]*m/gu, '').split('\n')) {
    const match = RESULT_LINE.exec(line);
    if (match) durations.set(match[1], Math.max(durations.get(match[1]) ?? 0, Number(match[2])));
  }
  return durations;
}

export function durationsDocument(durations, source) {
  const seconds = Object.fromEntries(
    [...durations]
      .filter(([, ms]) => ms >= MIN_RECORDED_MS)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, ms]) => [file, Math.round(ms / 100) / 10]),
  );
  return { source, seconds };
}

export function loadDurations(root = ROOT) {
  try {
    return JSON.parse(readFileSync(join(root, DURATIONS_FILE), 'utf8')).seconds ?? {};
  } catch {
    return {};
  }
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  const [source, ...logs] = process.argv.slice(2);
  if (!source || !logs.length) {
    console.error('Usage: ci-test-durations.mjs <source description> <vitest log>...');
    process.exit(1);
  }
  const durations = new Map();
  for (const log of logs)
    for (const [file, ms] of parseVitestLog(readFileSync(log, 'utf8'))) durations.set(file, ms);
  const document = durationsDocument(durations, source);
  writeFileSync(join(ROOT, DURATIONS_FILE), `${JSON.stringify(document, null, 2)}\n`);
  console.log(
    `${Object.keys(document.seconds).length} of ${durations.size} test files take ${MIN_RECORDED_MS} ms or more`,
  );
}
