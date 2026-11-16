#!/usr/bin/env node
// Guard for the Tobs design system migration (#4282). Bot-mode client code must not add new
// DSH design-token references or DSH UI imports, and feature code composes ds/ components
// instead of styling raw controls. Existing uses live in a baseline that only shrinks.
//   node scripts/check-design-tokens.mjs          check
//   node scripts/check-design-tokens.mjs --write  rewrite the baseline after removing uses
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const BASELINE = join(root, 'scripts/design-token-baseline.json');
const SOURCE = join(root, 'packages/client/src');

export const RULES = {
  dshToken: {
    pattern: /--dsw-[\w-]+/g,
    fix: 'read a Tobs token from ds/tobs.stylex.ts instead of a DSH --dsw-* variable',
  },
  dshImport: {
    pattern: /from\s+['"]@deepseek-ai\/dsh-client-ui[\w-]*['"]/g,
    fix: 'use a ds/ component instead of a DSH UI import',
  },
  rawControl: {
    pattern: /<(?:button|input|select|textarea)\b[^>]*?(?:stylex\.props|className=)/gs,
    fix: 'compose a ds/ control (extend it if it nearly fits) instead of styling a raw control',
    outsideDs: true,
  },
};

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

export function scan(dir = SOURCE) {
  const counts = {};
  for (const path of files(dir)) {
    const name = relative(root, path).replaceAll('\\', '/');
    const source = readFileSync(path, 'utf8');
    const inDs = name.includes('/client/ds/');
    for (const [rule, { pattern, outsideDs }] of Object.entries(RULES)) {
      if (outsideDs && inDs) continue;
      const found = source.match(pattern)?.length ?? 0;
      if (found === 0) continue;
      counts[name] ??= {};
      counts[name][rule] = found;
    }
  }
  return counts;
}

export function compare(current, baseline) {
  const problems = [];
  const names = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  for (const name of [...names].sort()) {
    for (const rule of Object.keys(RULES)) {
      const now = current[name]?.[rule] ?? 0;
      const allowed = baseline[name]?.[rule] ?? 0;
      if (now > allowed)
        problems.push(`${name}: ${now - allowed} new ${rule} use(s); ${RULES[rule].fix}`);
      else if (now < allowed)
        problems.push(
          `${name}: ${rule} dropped from ${allowed} to ${now}; shrink the baseline with node scripts/check-design-tokens.mjs --write`,
        );
    }
  }
  return problems;
}

function sorted(counts) {
  return Object.fromEntries(
    Object.keys(counts)
      .sort()
      .map((name) => [name, counts[name]]),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const current = scan();
  if (process.argv.includes('--write')) {
    const previous = JSON.parse(readFileSync(BASELINE, 'utf8'));
    const grown = compare(current, previous).filter((line) => line.includes(' new '));
    if (grown.length > 0 && !process.argv.includes('--init')) {
      for (const line of grown) console.error(`design tokens: ${line}`);
      console.error('The baseline only shrinks; remove the new uses instead.');
      process.exit(1);
    }
    writeFileSync(BASELINE, `${JSON.stringify(sorted(current), null, 2)}\n`);
  } else {
    const problems = compare(current, JSON.parse(readFileSync(BASELINE, 'utf8')));
    for (const line of problems) console.error(`design tokens: ${line}`);
    if (problems.length > 0) process.exit(1);
    const total = Object.values(current).reduce(
      (sum, rules) => sum + Object.values(rules).reduce((a, b) => a + b, 0),
      0,
    );
    console.log(`Design token guard passes (${total} baselined DSH uses left).`);
  }
}
