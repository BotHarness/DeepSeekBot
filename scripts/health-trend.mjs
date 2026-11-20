#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { LIMIT, collectWorktree } from './health.mjs';

export const KEEP = 90;
export const WINDOW = 7;
export const REGRESSION = 0.2;

export const METRICS = [
  ['perf.idleBusyPct', 'Idle main-thread busy (%)'],
  ['perf.typingP95', 'Typing latency p95 (ms)'],
  ['perf.heapMB', 'Heap (MB)'],
  ['perf.nodes', 'DOM nodes'],
  ['health.longFiles', `Source files over ${LIMIT} lines`],
  ['health.overLines', `Lines over the ${LIMIT}-line limit`],
  ['health.tscExclude', 'Files excluded from tsc'],
  ['health.proseBytes', 'Always-loaded agent prose (bytes)'],
];

const sum = (values) => values.reduce((total, value) => total + value, 0);

export function entryOf({ date, sha, run, perf, monkeys, health }) {
  const lines = Object.values(health['file-lines']);
  return {
    date,
    sha,
    run,
    perf: perf
      ? {
          idleBusyPct: perf.mainThreadBusyPct,
          typingP95: perf.typing?.p95,
          heapMB: perf.heapMB,
          nodes: perf.nodes,
        }
      : null,
    monkeys: monkeys.map(({ label, seed, ok, steps, failedAt }) => ({
      label,
      seed,
      ok,
      steps,
      failedAt,
    })),
    health: {
      longFiles: lines.length,
      overLines: sum(lines.map((count) => count - LIMIT)),
      tscExclude: health['tsc-exclude'].length,
      proseBytes: sum(Object.values(health['agent-prose-bytes'])),
    },
  };
}

export const appendEntry = (trend, entry) =>
  [...trend.filter((night) => night.date !== entry.date), entry].slice(-KEEP);

const valueAt = (entry, key) => {
  const value = key.split('.').reduce((node, part) => node?.[part], entry);
  return Number.isFinite(value) ? value : undefined;
};

export function median(values) {
  if (values.length === 0) return undefined;
  const ordered = values.toSorted((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

const show = (value) => (value === undefined ? '' : String(Number(value.toFixed(1))));

export function report(trend) {
  const now = trend.at(-1);
  const prior = trend.slice(-WINDOW - 1, -1);
  const warnings = [];
  const rows = METRICS.map(([key, label]) => {
    const value = valueAt(now, key);
    const typical = median(
      prior.map((entry) => valueAt(entry, key)).filter((v) => v !== undefined),
    );
    if (value !== undefined && typical !== undefined && value > typical * (1 + REGRESSION))
      warnings.push(`${label} is ${show(value)}, over ${WINDOW}-night median ${show(typical)}`);
    return `| ${label} | ${show(valueAt(prior.at(-1), key))} | ${show(value)} | ${show(typical)} |`;
  });
  const monkeys = now.monkeys.map(({ label, seed, ok, steps, failedAt }) =>
    ok
      ? `- ${label}: passed ${steps} steps (seed ${seed})`
      : `- ${label}: failed${failedAt ? ` at step ${failedAt}` : ''} (seed ${seed ?? 'unknown'})`,
  );
  const markdown = [
    `## Nightly health ${now.date}`,
    '',
    `| Metric | Last night | Now | ${WINDOW}-night median |`,
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    'UI monkey:',
    ...(monkeys.length ? monkeys : ['- no run']),
    ...(now.perf ? [] : ['', 'The performance run produced no summary.']),
    '',
  ].join('\n');
  return { markdown, warnings };
}

function readJson(path) {
  try {
    const text = readFileSync(path, 'utf8').trim();
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      previous: { type: 'string' },
      perf: { type: 'string' },
      monkey: { type: 'string', multiple: true, default: [] },
      out: { type: 'string', default: '.humanlayer/nightly/trend.json' },
      sha: { type: 'string', default: process.env.GITHUB_SHA ?? '' },
      run: { type: 'string', default: process.env.GITHUB_RUN_ID ?? '' },
    },
  });
  const previous = (values.previous && readJson(values.previous)) || [];
  const entry = entryOf({
    date: new Date().toISOString().slice(0, 10),
    sha: values.sha,
    run: values.run,
    perf: values.perf ? readJson(values.perf) : undefined,
    monkeys: values.monkey.map(
      (path) => readJson(path) ?? { label: basename(path, '.json'), ok: false },
    ),
    health: collectWorktree(),
  });
  const trend = appendEntry(Array.isArray(previous) ? previous : [], entry);
  const out = resolve(values.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(trend, null, 2)}\n`);
  const { markdown, warnings } = report(trend);
  console.log(markdown);
  for (const warning of warnings) console.log(`::warning title=Nightly health trend::${warning}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
