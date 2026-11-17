#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = 'scripts/health-baseline.json';
export const LIMIT = 1000;
const SOURCE = /\.(?:[cm]?[jt]sx?)$/u;
const SKIP =
  /^(?:\.agents|\.claude|agent\/skills)\/|(?:^|\/)(?:lib|dist|vendor)\/|\.d\.[cm]?ts$|generated/u;
export const PROSE = ['AGENTS.md', 'CLAUDE.md', 'apps/mobile/AGENTS.md'];

export const isSource = (path) => SOURCE.test(path) && !SKIP.test(path);

export const lineCount = (text) =>
  text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

export function tscExclude(text) {
  const block = /"exclude"\s*:\s*\[([^\]]*)\]/u.exec(text);
  if (!block) return [];
  return [...block[1].matchAll(/"((?:[^"\\]|\\.)*)"/gu)].map((match) => match[1]).sort();
}

export function collect(read, paths) {
  const lines = {};
  for (const path of paths.filter(isSource)) {
    const text = read(path);
    if (text === undefined) continue;
    const count = lineCount(text);
    if (count > LIMIT) lines[path] = count;
  }
  const prose = {};
  for (const path of PROSE) {
    const text = read(path);
    if (text !== undefined) prose[path] = Buffer.byteLength(text);
  }
  return {
    'file-lines': sorted(lines),
    'tsc-exclude': tscExclude(read('tsconfig.json') ?? ''),
    'agent-prose-bytes': prose,
  };
}

const sorted = (object) =>
  Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));

export const baselineOf = (current) => ({
  'long-files': Object.keys(current['file-lines']),
  'tsc-exclude': current['tsc-exclude'],
});

export function check(current, baseline) {
  const errors = [];
  const stale = [];
  const long = new Set(baseline['long-files'] ?? []);
  for (const [path, count] of Object.entries(current['file-lines']))
    if (!long.has(path))
      errors.push(
        `${path}: ${count} lines; a source file not in the baseline stays at or under ${LIMIT}. Fix: split it by responsibility into modules that each own one concern.`,
      );
  for (const path of long)
    if (current['file-lines'][path] === undefined)
      stale.push(`${path} is now at or under ${LIMIT} lines, or gone`);
  const excluded = new Set(baseline['tsc-exclude'] ?? []);
  for (const path of current['tsc-exclude'])
    if (!excluded.has(path))
      errors.push(
        `tsconfig.json excludes ${path}; the exclude list only shrinks. Fix: make the file typecheck instead.`,
      );
  for (const path of excluded)
    if (!current['tsc-exclude'].includes(path))
      stale.push(`tsconfig.json no longer excludes ${path}`);
  return { errors, stale };
}

export function lowered(current, baseline) {
  const next = baselineOf(current);
  const long = new Set(baseline['long-files'] ?? []);
  const excluded = new Set(baseline['tsc-exclude'] ?? []);
  return {
    'long-files': next['long-files'].filter((path) => long.has(path)),
    'tsc-exclude': next['tsc-exclude'].filter((path) => excluded.has(path)),
  };
}

export function raised(previous, next) {
  const errors = [];
  for (const key of ['long-files', 'tsc-exclude']) {
    const before = new Set(previous[key] ?? []);
    for (const path of next[key] ?? []) if (!before.has(path)) errors.push(`${key}: ${path} added`);
  }
  return errors;
}

export function growth(before, after) {
  const notes = [];
  for (const [path, count] of Object.entries(after['file-lines'])) {
    const previous = before['file-lines'][path];
    if (previous !== undefined && count > previous)
      notes.push({
        path,
        text: `${path} grew from ${previous} to ${count} lines (over ${LIMIT}); move the new code into its own module`,
      });
  }
  for (const [path, bytes] of Object.entries(after['agent-prose-bytes'])) {
    const previous = before['agent-prose-bytes'][path];
    if (previous !== undefined && bytes > previous)
      notes.push({
        path,
        text: `${path} grew from ${previous} to ${bytes} bytes; always-loaded agent prose should shrink, so move detail into an on-demand doc or a check`,
      });
  }
  return notes;
}

export function summary(current, before) {
  const lines = Object.entries(current['file-lines']);
  const over = lines.reduce((sum, [, count]) => sum + count - LIMIT, 0);
  const row = (label, now, then) => `| ${label} | ${then === undefined ? '' : then} | ${now} |`;
  const beforeLines = before ? Object.entries(before['file-lines']) : undefined;
  const prose = (state) => Object.values(state['agent-prose-bytes']).reduce((a, b) => a + b, 0);
  return [
    '| Metric | Base | Now |',
    '| --- | --- | --- |',
    row(`Source files over ${LIMIT} lines`, lines.length, beforeLines?.length),
    row(
      `Lines over the ${LIMIT}-line limit`,
      over,
      beforeLines?.reduce((sum, [, count]) => sum + count - LIMIT, 0),
    ),
    row('Files excluded from tsc', current['tsc-exclude'].length, before?.['tsc-exclude'].length),
    row('Always-loaded agent prose (bytes)', prose(current), before ? prose(before) : undefined),
    '',
    'Largest files:',
    ...lines
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([path, count]) => `- ${path}: ${count}`),
  ].join('\n');
}

function git(args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result;
}

function readWorktree(path) {
  try {
    return readFileSync(join(root, path), 'utf8');
  } catch {
    return undefined;
  }
}

function readAt(revision) {
  return (path) => {
    const result = git(['show', `${revision}:${path}`]);
    return result.status === 0 ? result.stdout : undefined;
  };
}

const tracked = () => git(['ls-files', '-z']).stdout.split('\0').filter(Boolean);

export const collectWorktree = () => collect(readWorktree, tracked());

function main(argv) {
  const base = argv.find((arg) => arg.startsWith('--base='))?.slice('--base='.length);
  const current = collectWorktree();
  const baselineText = readWorktree(BASELINE);
  if (argv.includes('--update')) {
    const next = baselineText ? lowered(current, JSON.parse(baselineText)) : baselineOf(current);
    writeFileSync(join(root, BASELINE), `${JSON.stringify(next, null, 2)}\n`);
    console.log(`health: wrote ${BASELINE}`);
    return 0;
  }
  if (!baselineText) throw new Error(`${BASELINE} is missing; create it with --update`);
  const baseline = JSON.parse(baselineText);
  const errors = [];
  const notes = [];
  let before;
  if (base) {
    if (git(['cat-file', '-e', `${base}^{commit}`]).status !== 0)
      throw new Error(`cannot read revision ${base}; fetch it first`);
    const previous = readAt(base)(BASELINE);
    if (previous)
      errors.push(
        ...raised(JSON.parse(previous), baseline).map(
          (error) => `the baseline only shrinks: ${error}`,
        ),
      );
    const changed = git(['diff', '--name-only', '-z', base, '--'])
      .stdout.split('\0')
      .filter(Boolean);
    const atBase = collect(readAt(base), changed);
    const lines = { ...current['file-lines'] };
    for (const path of changed) delete lines[path];
    before = { ...atBase, 'file-lines': sorted({ ...lines, ...atBase['file-lines'] }) };
    notes.push(...growth(before, current));
  }
  const result = check(current, baseline);
  errors.push(...result.errors);
  if (result.stale.length)
    errors.push(
      `The baseline is higher than the code. Lower it with \`node scripts/health.mjs --update\` (it never raises):\n  ${result.stale.join('\n  ')}`,
    );
  const report = summary(current, before);
  if (argv.includes('--report') || base) console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY && base)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Codebase health\n\n${report}\n${notes.length ? `\nGrew in this change:\n${notes.map((note) => `- ${note.text}`).join('\n')}\n` : ''}`,
    );
  for (const note of notes)
    console.log(
      process.env.GITHUB_ACTIONS
        ? `::warning file=${note.path}::${note.text}`
        : `warning: ${note.text}`,
    );
  if (errors.length) {
    console.error(`health:\n${errors.join('\n')}`);
    return 1;
  }
  console.log(
    `health: ${Object.keys(current['file-lines']).length} baselined files over ${LIMIT} lines, nothing new`,
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`health: ${error.message}`);
    process.exitCode = 1;
  }
}
