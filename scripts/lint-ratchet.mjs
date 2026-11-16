#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = 'scripts/guardrails.json';
const LINTABLE = /\.(?:[cm]?[jt]sx?)$/u;

const FIELDS = ['id', 'layer', 'source', 'fix', 'check'];

export function validateGuardrails(guardrails, exists) {
  const errors = [];
  const ids = new Set();
  for (const guardrail of guardrails) {
    for (const field of FIELDS)
      if (typeof guardrail[field] !== 'string' || guardrail[field].trim() === '')
        errors.push(`${REGISTRY}: ${guardrail.id ?? '?'} needs a ${field}`);
    if (ids.has(guardrail.id)) errors.push(`${REGISTRY}: duplicate id ${guardrail.id}`);
    ids.add(guardrail.id);
    for (const path of [guardrail.check, guardrail.baseline].filter(Boolean))
      if (!exists(path)) errors.push(`${REGISTRY}: ${guardrail.id} names a missing file ${path}`);
  }
  return errors;
}

export function readGuardrails(repo = root) {
  const guardrails = JSON.parse(readFileSync(join(repo, REGISTRY), 'utf8')).guardrails;
  const errors = validateGuardrails(guardrails, (path) => existsSync(join(repo, path)));
  if (errors.length) throw new Error(errors.join('\n'));
  return guardrails;
}

export const ratcheted = (guardrails) =>
  guardrails.filter((guardrail) => guardrail.check === 'scripts/lint-ratchet.mjs');

const ruleCode = (rule) => {
  const [plugin, name] = rule.split('/');
  return name === undefined ? rule : `${plugin}(${name})`;
};

const where = (diagnostic) => {
  const span = diagnostic.labels?.[0]?.span;
  return span === undefined
    ? diagnostic.filename
    : `${diagnostic.filename}:${span.line}:${span.column}`;
};

export function countFindings(diagnostics, guardrails) {
  const byCode = new Map(guardrails.map((guardrail) => [ruleCode(guardrail.rule), guardrail]));
  const counts = {};
  const spots = {};
  const other = [];
  for (const diagnostic of diagnostics) {
    const guardrail = byCode.get(diagnostic.code);
    if (guardrail === undefined) {
      if (diagnostic.severity === 'error') other.push(diagnostic);
      continue;
    }
    const file = diagnostic.filename.replaceAll('\\', '/');
    const perRule = (counts[guardrail.rule] ??= {});
    perRule[file] = (perRule[file] ?? 0) + 1;
    ((spots[guardrail.rule] ??= {})[file] ??= []).push(where(diagnostic));
  }
  return { counts, spots, other };
}

export function compare({ counts, spots = {}, baseline, guardrails, files }) {
  const errors = [];
  const stale = [];
  for (const guardrail of guardrails) {
    const actual = counts[guardrail.rule] ?? {};
    const allowed = baseline[guardrail.rule] ?? {};
    const scope = files ?? new Set([...Object.keys(actual), ...Object.keys(allowed)]);
    for (const file of scope) {
      const found = actual[file] ?? 0;
      const limit = allowed[file] ?? 0;
      if (found > limit)
        errors.push(
          `${file}: ${found} × ${guardrail.rule}, baseline allows ${limit}. ` +
            `[${guardrail.id}, ${guardrail.source}] Fix: ${guardrail.fix}` +
            (spots[guardrail.rule]?.[file] ?? []).map((spot) => `\n  at ${spot}`).join(''),
        );
      else if (found < limit && files === undefined)
        stale.push(`${file}: ${guardrail.rule} baseline ${limit}, now ${found}`);
    }
  }
  return { errors, stale };
}

export function malformed(baseline) {
  const errors = [];
  for (const [rule, files] of Object.entries(baseline))
    for (const [file, count] of Object.entries(files))
      if (!Number.isSafeInteger(count) || count < 0)
        errors.push(`${file}: ${rule} baseline ${JSON.stringify(count)} is not a count`);
  return errors;
}

function readBaseline(text, label) {
  const baseline = JSON.parse(text);
  const errors = malformed(baseline);
  if (errors.length) throw new Error(`${label}:\n  ${errors.join('\n  ')}`);
  return baseline;
}

export function raised(base, next) {
  const errors = [];
  for (const [rule, files] of Object.entries(next))
    for (const [file, count] of Object.entries(files)) {
      const allowed = base[rule]?.[file] ?? 0;
      if (count > allowed)
        errors.push(`${file}: ${rule} baseline raised from ${allowed} to ${count}`);
    }
  return errors;
}

export function lowered(baseline, counts, guardrails) {
  const next = {};
  for (const guardrail of guardrails) {
    const allowed = baseline[guardrail.rule] ?? {};
    const actual = counts[guardrail.rule] ?? {};
    const entries = Object.keys(allowed)
      .sort()
      .map((file) => [file, Math.min(allowed[file], actual[file] ?? 0)])
      .filter(([, count]) => count > 0);
    if (entries.length) next[guardrail.rule] = Object.fromEntries(entries);
  }
  return next;
}

function runOxlint(paths) {
  const bin = join(
    dirname(createRequire(import.meta.url).resolve('oxlint/package.json')),
    'bin',
    'oxlint',
  );
  const result = spawnSync(process.execPath, [bin, '--type-aware', '--format', 'json', ...paths], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  const start = result.stdout.indexOf('{');
  if (start === -1)
    throw new Error(`oxlint produced no JSON report:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout.slice(start)).diagnostics;
}

const git = (args) => {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result;
};

function baselineAt(revision) {
  if (git(['cat-file', '-e', `${revision}^{commit}`]).status !== 0)
    throw new Error(`cannot read revision ${revision}; fetch it first`);
  const result = git(['show', `${revision}:scripts/lint-baseline.json`]);
  return result.status === 0
    ? readBaseline(result.stdout, `scripts/lint-baseline.json at ${revision}`)
    : undefined;
}

function checkBase(revision) {
  const current = readBaseline(
    readFileSync(join(root, 'scripts/lint-baseline.json'), 'utf8'),
    'scripts/lint-baseline.json',
  );
  const previous = baselineAt(revision);
  if (previous === undefined) {
    console.log(`lint ratchet: ${revision} has no baseline yet`);
    return 0;
  }
  const errors = raised(previous, current);
  if (errors.length) {
    console.error(
      `lint ratchet: the baseline only shrinks. Fix the new findings instead of raising it:\n  ${errors.join('\n  ')}`,
    );
    return 1;
  }
  console.log(`lint ratchet: baseline not raised since ${revision}`);
  return 0;
}

function main(argv) {
  const base = argv.find((arg) => arg.startsWith('--base='));
  if (base) return checkBase(base.slice('--base='.length));
  const update = argv.includes('--update');
  const paths = argv
    .filter((arg) => !arg.startsWith('--'))
    .map((path) => relative(root, resolve(path)).replaceAll('\\', '/'))
    .filter((path) => LINTABLE.test(path));
  if (argv.some((arg) => !arg.startsWith('--')) && paths.length === 0) return 0;
  const guardrails = ratcheted(readGuardrails());
  const baselineFile = join(root, 'scripts/lint-baseline.json');
  const baseline = readBaseline(readFileSync(baselineFile, 'utf8'), 'scripts/lint-baseline.json');
  const diagnostics = runOxlint(paths);
  const { counts, spots, other } = countFindings(diagnostics, guardrails);
  if (update) {
    if (paths.length) throw new Error('--update runs on the whole repository only');
    writeFileSync(
      baselineFile,
      `${JSON.stringify(lowered(baseline, counts, guardrails), null, 2)}\n`,
    );
  }
  const files = paths.length ? new Set(paths) : undefined;
  const { errors, stale } = compare({
    counts,
    spots,
    baseline: update ? lowered(baseline, counts, guardrails) : baseline,
    guardrails,
    files,
  });
  for (const diagnostic of other)
    errors.push(`${where(diagnostic)} ${diagnostic.code}: ${diagnostic.message}`);
  if (stale.length)
    errors.push(
      `The baseline is higher than the code. Lower it with \`node scripts/lint-ratchet.mjs --update\` (it never raises):\n  ${stale.join('\n  ')}`,
    );
  if (errors.length) {
    console.error(`lint ratchet:\n${errors.join('\n')}`);
    return 1;
  }
  const total = Object.values(lowered(baseline, counts, guardrails))
    .flatMap(Object.values)
    .reduce((sum, count) => sum + count, 0);
  console.log(`lint ratchet: no new findings (${total} baselined)`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`lint ratchet: ${error.message}`);
    process.exitCode = 1;
  }
}
