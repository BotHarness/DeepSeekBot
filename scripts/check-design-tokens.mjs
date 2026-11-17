#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
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
    exempt: ['packages/client/src/client/ds/shell-layer.ts'],
  },
  rawControl: {
    pattern: /<(?:button|input|select|textarea)\b(?:=>|[^>])*?(?:stylex\.props|className=)/gs,
    fix: 'compose a ds/ control (extend it if it nearly fits) instead of styling a raw control',
    outsideDs: true,
  },
  legacyCss: {
    pattern: /\.bh-[\w-]+[^{}`;]*\{[^{}`]*:[^{}`]*\}/g,
    fix: 'style it with stylex.create and tokens from ds/tobs.stylex.ts instead of a new bh- CSS rule',
  },
  literalColor: {
    pattern: /['"`](?:#[\da-fA-F]{3,8}\b|(?:rgba?|hsla?)\(|var\(--tobs-)/g,
    fix: 'reference a constant from ds/tobs.stylex.ts instead of a colour literal or a var(--tobs-*) string',
    outsideDs: true,
    when: (source) => source.includes('stylex.create('),
  },
  inlineStyle: {
    pattern: /style=\{\{[^}]*?(?:#[\da-fA-F]{3,8}\b|\d+px|(?:rgba?|hsla?)\()/gs,
    fix: 'use stylex.create (a dynamic style for runtime values) instead of an inline style literal',
    outsideDs: true,
  },
  lineBorder: {
    pattern:
      /border(?:-(?:top|right|bottom|left|block|inline)(?:-start|-end)?)?\s*:\s*(?:[^;'"`{}]|\$\{[^}]*\})*?\bsolid\b|border\w*Style:\s*['"]solid['"]/g,
    fix: 'separate surfaces with a gap showing the canvas, not a line; inputs and focus rings live in ds/',
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

export function scan(dir = SOURCE, only) {
  const counts = {};
  const paths = only
    ? only.filter((path) => /\.(?:ts|tsx)$/.test(path) && !path.endsWith('.d.ts'))
    : files(dir);
  for (const path of paths) {
    if (!relative(SOURCE, path).match(/^(?!\.\.)/)) continue;
    const name = relative(root, path).replaceAll('\\', '/');
    const source = readFileSync(path, 'utf8');
    const inDs = name.includes('/client/ds/');
    for (const [rule, { pattern, outsideDs, exempt, when }] of Object.entries(RULES)) {
      if ((outsideDs && inDs) || exempt?.includes(name) || (when && !when(source))) continue;
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

function pick(counts, names) {
  return Object.fromEntries(
    names.filter((name) => counts[name]).map((name) => [name, counts[name]]),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const only = args.length > 0 ? args.map((path) => resolve(path)) : undefined;
  const names = only?.map((path) => relative(root, path).replaceAll('\\', '/'));
  const current = scan(SOURCE, only);
  if (process.argv.includes('--write') && only) {
    console.error('--write rescans the whole client; run it without paths.');
    process.exit(1);
  }
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
    const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
    const problems = compare(current, names ? pick(baseline, names) : baseline);
    for (const line of problems) console.error(`design tokens: ${line}`);
    if (problems.length > 0) process.exit(1);
    const total = Object.values(current).reduce(
      (sum, rules) => sum + Object.values(rules).reduce((a, b) => a + b, 0),
      0,
    );
    console.log(`Design token guard passes (${total} baselined uses left).`);
  }
}
