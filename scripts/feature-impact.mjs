#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { claims, parseGlossary, readFeatures } from './feature-sources.mjs';
import { mapDirectory } from './verification-inventory.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function byPaths(features, paths) {
  const hits = [];
  for (const feature of features) {
    const own = `${mapDirectory}/${feature.file}`;
    const matched = paths.filter((path) => path === own || claims(feature, path));
    if (matched.length) hits.push({ feature, matched });
  }
  return hits;
}

export function unclaimed(features, paths) {
  return paths.filter(
    (path) =>
      /^(?:packages|apps)\/.+\.(?:[cm]?[jt]sx?|swift|kt)$/u.test(path) &&
      !features.some((feature) => claims(feature, path)),
  );
}

const fold = (text) => text.toLowerCase();

export function glossaryHits(glossary, text) {
  const folded = fold(text);
  const found = new Set();
  for (const map of [glossary.names, glossary.avoided])
    for (const [name, term] of map) {
      const word = fold(name);
      const ascii = /^[\x20-\x7e]+$/u.test(word);
      const pattern = ascii
        ? new RegExp(
            `(?<![a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?![a-z0-9])`,
            'u',
          )
        : undefined;
      if (pattern ? pattern.test(folded) : folded.includes(word)) found.add(term);
    }
  return found;
}

export function byTerms(features, glossary, text) {
  const found = glossaryHits(glossary, text);
  const weight = new Map();
  for (const feature of features)
    for (const term of feature.terms ?? []) weight.set(term, (weight.get(term) ?? 0) + 1);
  const words = new Set(fold(text).match(/[a-z0-9]{4,}/gu) ?? []);
  return features
    .map((feature) => {
      const terms = (feature.terms ?? []).filter((term) =>
        found.has(glossary.names.get(term) ?? term),
      );
      const title = (fold(feature.title).match(/[a-z0-9]{4,}/gu) ?? []).filter((word) =>
        words.has(word),
      );
      const score = terms.reduce((sum, term) => sum + 1 / weight.get(term), 0) + title.length * 0.5;
      return { feature, matched: [...terms, ...title], score };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export function render(hits, notes = [], label = 'Touched features') {
  if (!hits.length) return [`${label}: none of the mapped features.`, ...notes].join('\n');
  return [
    `${label} (${hits.length}):`,
    ...hits.flatMap(({ feature, matched }) => [
      `- **${feature.title}** — \`${mapDirectory}/${feature.file}\``,
      `  - journey: ${feature.journey || 'see the feature file'}; needs a model: ${feature.model || 'see the feature file'}`,
      ...(feature.terms?.length ? [`  - terms: ${feature.terms.join(', ')}`] : []),
      `  - matched: ${matched.slice(0, 3).join(', ')}${matched.length > 3 ? ` (+${matched.length - 3})` : ''}`,
    ]),
    ...notes,
  ].join('\n');
}

function changedSince(base) {
  const result = spawnSync('git', ['diff', '--name-only', '-z', base, '--'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`cannot diff against ${base}; fetch it first`);
  return result.stdout.split('\0').filter(Boolean);
}

function main(argv) {
  const value = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const features = readFeatures(root);
  const termsText = value('terms');
  const base = value('base');
  const at = argv.indexOf('--paths');
  const paths = at === -1 ? [] : argv.slice(at + 1).filter((arg) => !arg.startsWith('--'));
  if (!termsText && !base && at === -1) {
    console.error(
      'usage: node scripts/feature-impact.mjs --base=<rev> | --paths <file>... | --terms="<bug text>" [--json] [--summary]',
    );
    return 2;
  }
  let hits;
  const notes = [];
  if (termsText) {
    const glossary = parseGlossary(readFileSync(join(root, 'GLOSSARY.md'), 'utf8'));
    hits = byTerms(features, glossary, termsText);
  } else {
    const changed = base ? changedSince(base) : paths;
    hits = byPaths(features, changed);
    const loose = unclaimed(features, changed);
    const pending = features.filter((feature) => feature.sources === undefined).length;
    if (loose.length)
      notes.push(
        `\n${loose.length} changed source file(s) belong to no mapped feature yet (${pending} of ${features.length} features have no Sources).`,
      );
  }
  if (argv.includes('--json')) {
    console.log(
      JSON.stringify(
        hits.map(({ feature, matched }) => ({ ...feature, matched })),
        null,
        2,
      ),
    );
    return 0;
  }
  const report = render(hits, notes, termsText ? 'Likely features' : 'Touched features');
  console.log(report);
  if (argv.includes('--summary') && process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Feature impact\n\n${report}\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`feature-impact: ${error.message}`);
    process.exitCode = 1;
  }
}
