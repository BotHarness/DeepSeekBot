#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BASELINE = 'scripts/host-cast-baseline.json';
export const COMPAT_MODULES = new Set(['packages/core/src/runtime/native-agent-compat.ts']);
const PATTERN = /\b[A-Za-z_$]*[cC]tx\b(?:\??\.[A-Za-z_$][\w$]*)*\)?\s+as\s+unknown\s+as\b/gu;

export function hostCastCount(source) {
  return [...source.matchAll(PATTERN)].length;
}

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(?:ts|tsx|mts)$/u.test(entry.name) && !entry.name.endsWith('.d.ts'))
      files.push(path);
  }
  return files;
}

export function scanHostCasts(root) {
  const counts = {};
  const packages = join(root, 'packages');
  for (const name of readdirSync(packages, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const src = join(packages, name.name, 'src');
    let files;
    try {
      files = sourceFiles(src);
    } catch {
      continue;
    }
    for (const file of files) {
      const path = relative(root, file).replaceAll('\\', '/');
      if (COMPAT_MODULES.has(path)) continue;
      const count = hostCastCount(readFileSync(file, 'utf8'));
      if (count > 0) counts[path] = count;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

export function checkHostCasts(counts, baseline) {
  const errors = [];
  for (const [path, count] of Object.entries(counts)) {
    const allowed = baseline[path] ?? 0;
    if (count > allowed)
      errors.push(
        `${path}: ${count - allowed} new Host Context cast(s). Read the Host API through the compatibility module (${[...COMPAT_MODULES].join(', ')}) so a changed DSH API degrades or fails with HOST_INCOMPATIBLE instead of crashing.`,
      );
  }
  for (const [path, allowed] of Object.entries(baseline)) {
    const count = counts[path] ?? 0;
    if (count < allowed)
      errors.push(
        `${path}: baseline records ${allowed} Host Context cast(s) but ${count} remain. Lower it in ${BASELINE}; the baseline only shrinks.`,
      );
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..');
  const counts = scanHostCasts(root);
  if (process.argv.includes('--write-baseline')) {
    writeFileSync(join(root, BASELINE), `${JSON.stringify(counts, null, 2)}\n`);
  } else {
    const baseline = JSON.parse(readFileSync(join(root, BASELINE), 'utf8'));
    const errors = checkHostCasts(counts, baseline);
    if (errors.length > 0) {
      for (const error of errors) console.error(`host casts: ${error}`);
      process.exitCode = 1;
    } else console.log('host casts: no new Host Context casts outside the compatibility module');
  }
}
