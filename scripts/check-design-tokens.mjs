#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareBaselineCounts, countsByRule } from './baseline-counts.mjs';

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
    exempt: [
      'packages/client/src/client/ds/shell-layer.ts',
      'packages/client/src/client/ds/file-type-icon.tsx',
    ],
  },
  rawControl: {
    pattern: /<(?:button|input|select|textarea)\b(?:=>|[^>])*?(?:stylex\.props|className=)/gs,
    fix: 'compose a ds/ control (extend it if it nearly fits) instead of styling a raw control',
    outsideDs: true,
  },
  legacyCss: {
    pattern: /\.bh-[\w-]+[^{}`;]*\{(?:[^{}`]|\$\{[^{}`]*\})*:(?:[^{}`]|\$\{[^{}`]*\})*\}/g,
    fix: 'style it with stylex.create and tokens from ds/tobs.stylex.ts instead of a new bh- CSS rule',
  },
  literalColor: {
    pattern: /['"`](?:#[\da-fA-F]{3,8}\b|(?:rgba?|hsla?)\(|var\(--tobs-)/g,
    fix: 'reference a constant from ds/tobs.stylex.ts instead of a colour literal or a var(--tobs-*) string',
    outsideDs: true,
    when: (source) => source.includes('stylex.create('),
  },
  inlineStyle: {
    pattern:
      /style=\{\{[^}]*?(?:#[\da-fA-F]{3,8}\b|\d+px|(?:rgba?|hsla?)\(|[A-Za-z]:\s*-?\d+(?:\.\d+)?\s*[,}])/gs,
    fix: 'use stylex.create (a dynamic style for runtime values) instead of an inline style literal',
    outsideDs: true,
  },
  lineBorder: {
    pattern:
      /border(?:-(?:top|right|bottom|left|block|inline)(?:-start|-end)?)?\s*:\s*(?:[^;'"`{}]|\$\{[^}]*\})*?\bsolid\b|border\w*:\s*['"][^'"\n]*\bsolid\b|border\w*Style:\s*['"]solid['"]/g,
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

function compareTotals(current, baseline) {
  return compareBaselineCounts(countsByRule(current), countsByRule(baseline));
}

export function compare(current, baseline) {
  const { grown, shrunk } = compareTotals(current, baseline);
  return [
    ...grown.map(({ rule, message }) => `${message}; ${RULES[rule].fix}`),
    ...shrunk.map(
      (message) =>
        `${message}; shrink the baseline with node scripts/check-design-tokens.mjs --write`,
    ),
  ];
}

function sorted(counts) {
  return Object.fromEntries(
    Object.keys(counts)
      .sort()
      .map((name) => [name, counts[name]]),
  );
}

function stagedBaseline() {
  const staged = spawnSync('git', ['show', `:${relative(root, BASELINE).replaceAll('\\', '/')}`], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  return staged.status === 0 ? staged.stdout : readFileSync(BASELINE, 'utf8');
}

function baselineAt(ref) {
  const result = spawnSync(
    'git',
    ['show', `${ref}:${relative(root, BASELINE).replaceAll('\\', '/')}`],
    {
      cwd: root,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    },
  );
  if (result.status !== 0) {
    console.error(`design tokens: cannot read the baseline at ${ref}; fetch the PR base commit`);
    process.exit(1);
  }
  return JSON.parse(result.stdout);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const staged = args.some((arg) => !arg.startsWith('--'));
  const write = args.includes('--write');
  if (write && staged) {
    console.error('--write rescans the whole client; run it without paths.');
    process.exit(1);
  }
  const current = scan();
  const baseline = JSON.parse(staged ? stagedBaseline() : readFileSync(BASELINE, 'utf8'));
  const requestedBase = process.env.BASELINE_BASE;
  if (requestedBase) {
    const ref = /^0+$/u.test(requestedBase) ? 'HEAD^' : requestedBase;
    const { grown } = compareTotals(baseline, baselineAt(ref));
    for (const { message } of grown) console.error(`design tokens: baseline ${message}`);
    if (grown.length) process.exit(1);
  }
  if (write) {
    const { grown } = compareTotals(current, baseline);
    if (grown.length > 0) {
      for (const { rule, message } of grown)
        console.error(`design tokens: ${message}; ${RULES[rule].fix}`);
      process.exit(1);
    }
    writeFileSync(BASELINE, `${JSON.stringify(sorted(current), null, 2)}\n`);
  } else {
    const problems = compare(current, baseline);
    for (const line of problems) console.error(`design tokens: ${line}`);
    if (problems.length > 0) process.exit(1);
    const total = Object.values(current).reduce(
      (sum, rules) => sum + Object.values(rules).reduce((a, b) => a + b, 0),
      0,
    );
    console.log(`Design token guard passes (${total} baselined uses left).`);
  }
}
