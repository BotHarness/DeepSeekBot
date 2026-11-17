import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';
import { mapDirectory } from './verification-inventory.mjs';

export const BASELINE = 'scripts/feature-map-baseline.json';

export function listItems(text, heading) {
  const lines = text.split('\n');
  const start = lines.indexOf(`## ${heading}`);
  if (start === -1) return undefined;
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('#')) break;
    const item = /^- (.+)$/u.exec(line.trim())?.[1].trim();
    if (item) items.push(item.replace(/^`(.*)`$/u, '$1'));
  }
  return items;
}

const cells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/gu, '')
    .split('|')
    .map((cell) => cell.trim());

export function parseFeature(file, text, index) {
  const row = index
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map(cells)
    .find((row) => row.at(-1)?.includes(`](${file})`));
  return {
    file,
    title: text.split('\n')[0].replace(/^#\s*/u, ''),
    model: row?.[1] ?? '',
    journey: row?.[2] ?? '',
    sources: listItems(text, 'Sources'),
    terms: listItems(text, 'Terms'),
  };
}

export function readFeatures(repo) {
  const directory = join(repo, mapDirectory);
  const index = readFileSync(join(directory, 'README.md'), 'utf8');
  return readdirSync(directory)
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .sort()
    .map((file) => parseFeature(file, readFileSync(join(directory, file), 'utf8'), index));
}

export function parseGlossary(text) {
  const names = new Map();
  const avoided = new Map();
  let term;
  for (const line of text.split('\n')) {
    const heading = /^\*\*(.+)\*\*:$/u.exec(line)?.[1];
    if (heading) {
      term = heading;
      names.set(heading, heading);
      for (const name of heading.split(' / ')) names.set(name.trim(), heading);
      continue;
    }
    const avoid = /^_Avoid_:\s*(.+)$/u.exec(line)?.[1];
    if (avoid && term)
      for (const word of avoid.split(/[,，、]/u)) {
        const plain = word.replace(/\(.*?\)|（.*?）/gu, '').trim();
        if (plain && !avoided.has(plain)) avoided.set(plain, term);
      }
  }
  return { names, avoided };
}

export const claims = (feature, path) =>
  (feature.sources ?? []).some((glob) => matchesGlob(path, glob));

const literalPrefix = (glob) => {
  const head = glob.slice(0, glob.search(/[*?[{]/u) + 1 || glob.length + 1);
  return head.slice(0, head.lastIndexOf('/') + 1);
};

export const matchesTracked = (tracked, glob) => {
  const prefix = literalPrefix(glob);
  return tracked.some((path) => path.startsWith(prefix) && matchesGlob(path, glob));
};

export function checkSources(features, tracked, glossary, baseline) {
  const errors = [];
  const pending = new Set(baseline.unmapped ?? []);
  for (const feature of features) {
    const mapped = feature.sources !== undefined && feature.terms !== undefined;
    if (!mapped && !pending.has(feature.file))
      errors.push(
        `${feature.file}: add a "## Sources" list (globs of the code it covers) and a "## Terms" list (GLOSSARY.md entries it uses)`,
      );
    if (mapped && pending.has(feature.file))
      errors.push(`${feature.file} is mapped now; remove it from ${BASELINE} "unmapped"`);
    for (const glob of feature.sources ?? [])
      if (!matchesTracked(tracked, glob))
        errors.push(`${feature.file}: source ${glob} matches no tracked file`);
    if (feature.sources?.length === 0) errors.push(`${feature.file}: "## Sources" is empty`);
    if (feature.terms?.length === 0) errors.push(`${feature.file}: "## Terms" is empty`);
    for (const term of feature.terms ?? [])
      if (!glossary.names.has(term))
        errors.push(`${feature.file}: term "${term}" is not a GLOSSARY.md entry`);
  }
  const files = new Set(features.map((feature) => feature.file));
  for (const file of pending)
    if (!files.has(file)) errors.push(`${BASELINE} lists ${file}, which is not a feature`);
  return errors;
}

export function trackedFiles(repo) {
  const result = spawnSync('git', ['ls-files', '-z'], {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result.stdout.split('\0').filter(Boolean);
}

export function auditSources(repo) {
  const baselinePath = join(repo, BASELINE);
  const baseline = existsSync(baselinePath)
    ? JSON.parse(readFileSync(baselinePath, 'utf8'))
    : { unmapped: [] };
  const glossary = parseGlossary(readFileSync(join(repo, 'GLOSSARY.md'), 'utf8'));
  return checkSources(readFeatures(repo), trackedFiles(repo), glossary, baseline);
}
