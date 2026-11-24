import { posix } from 'node:path';

export const TEST_AREAS = ['packages/*/test/**', 'apps/*/test/**', 'scripts/test/**'];

function escapeRegex(text) {
  return text.replace(/[.+^$()|[\]\\]/g, '\\$&');
}

export function globToRegExp(glob) {
  let out = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*' && glob[index + 1] === '*') {
      if (glob[index + 2] === '/') {
        out += '(?:.*/)?';
        index += 2;
      } else {
        out += '.*';
        index += 1;
      }
    } else if (char === '*') out += '[^/]*';
    else if (char === '?') out += '[^/]';
    else if (char === '{') {
      const close = glob.indexOf('}', index);
      const options = glob.slice(index + 1, close).split(',');
      out += `(?:${options.map((option) => globToRegExp(option).source.slice(1, -1)).join('|')})`;
      index = close;
    } else out += escapeRegex(char);
  }
  return new RegExp(`^${out}$`, 's');
}

const compiled = new Map();
export function matchesGlob(path, glob) {
  if (!compiled.has(glob)) compiled.set(glob, globToRegExp(glob));
  return compiled.get(glob).test(path);
}

export const CODE = /\.(?:[cm]?[jt]sx?)$/;
const STRING = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"]+)\1/g;

function directoriesOf(files) {
  const directories = new Set();
  for (const file of files) {
    let current = posix.dirname(file);
    while (current !== '.' && !directories.has(current)) {
      directories.add(current);
      current = posix.dirname(current);
    }
  }
  return directories;
}

export function createIndex(files, read) {
  const tracked = new Set(files);
  const directories = directoriesOf(files);
  const sources = new Map();
  const source = (file) => {
    if (!sources.has(file)) sources.set(file, read(file));
    return sources.get(file);
  };
  return { files, tracked, directories, source };
}

export function normalize(path) {
  const joined = posix.normalize(path).replace(/\/+$/, '');
  return joined.startsWith('../') || joined === '..' ? null : joined;
}

export function pathReferences(index, file) {
  const references = new Set();
  const base = posix.dirname(file);
  for (const [, , literal] of index.source(file).matchAll(STRING)) {
    if (literal.includes('${') || literal.includes('://') || literal.startsWith('/')) continue;
    if (!literal.includes('/') && !/\.[a-z0-9]+$/i.test(literal)) continue;
    const trimmed = literal.replace(/^\.\//, '');
    for (const candidate of [normalize(posix.join(base, literal)), normalize(trimmed)]) {
      if (!candidate || candidate === '.') continue;
      if (index.tracked.has(candidate) || index.directories.has(candidate))
        references.add(candidate);
    }
  }
  return references;
}

function resolveSpecifier(index, from, specifier) {
  if (!specifier.startsWith('.')) return null;
  return resolveTarget(index, normalize(posix.join(posix.dirname(from), specifier)));
}

function resolveTarget(index, target) {
  if (!target) return null;
  const candidates = [target];
  for (const extension of ['.ts', '.tsx', '.mjs', '.js', '.json'])
    candidates.push(target + extension);
  if (target.endsWith('.js'))
    candidates.push(target.replace(/\.js$/, '.ts'), target.replace(/\.js$/, '.tsx'));
  for (const extension of ['/index.ts', '/index.tsx', '/index.mjs', '/index.js'])
    candidates.push(target + extension);
  return candidates.find((candidate) => index.tracked.has(candidate)) ?? null;
}

export function importClosure(index, entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file) || !index.tracked.has(file)) continue;
    seen.add(file);
    if (!CODE.test(file)) continue;
    for (const [, , specifier] of index.source(file).matchAll(SPECIFIER)) {
      const resolved = resolveSpecifier(index, file, specifier);
      if (resolved) queue.push(resolved);
    }
  }
  return seen;
}

function covers(reference, path) {
  return path === reference || path.startsWith(`${reference}/`);
}

export function referenceMap(index) {
  const map = new Map();
  for (const file of index.files) {
    if (!CODE.test(file) || !TEST_AREAS.some((glob) => matchesGlob(file, glob))) continue;
    const references = [...pathReferences(index, file)];
    if (!references.length) continue;
    const expanded = new Set(references);
    for (const reference of references)
      if (CODE.test(reference))
        for (const imported of importClosure(index, reference)) expanded.add(imported);
    map.set(file, expanded);
  }
  return map;
}

export function referencingFiles(map, paths) {
  const found = new Set();
  for (const [file, references] of map)
    for (const reference of references)
      if (paths.some((path) => covers(reference, path))) found.add(file);
  return [...found].sort();
}

export const TEST_ALIASES = [['@/', 'apps/docs/src/']];
const LISTING = /\.(?:json|ya?ml)$/;

function subpathAliases(index) {
  const aliases = [...TEST_ALIASES];
  for (const manifest of index.files) {
    if (!/^(?:apps|packages)\/[^/]+\/package\.json$/.test(manifest)) continue;
    let data;
    try {
      data = JSON.parse(index.source(manifest));
    } catch {
      continue;
    }
    const target = data.exports?.['./*'];
    if (!data.name || typeof target !== 'string' || !target.startsWith('./')) continue;
    const [before, after = ''] = target.slice(2).split('*');
    aliases.push([`${data.name}/`, `${posix.dirname(manifest)}/${before}`, after]);
  }
  return aliases;
}

export function staleReferences(index, removed) {
  const gone = new Set(removed);
  const result = { files: [], listing: null };
  if (!gone.size) return result;
  const ghost = { ...index, tracked: new Set([...index.tracked, ...gone]) };
  const aliases = subpathAliases(index);
  const stems = [...gone].map((path) => posix.basename(path).replace(/\.[^.]+$/, ''));
  const targetsOf = (file, literal) => {
    if (literal.startsWith('.')) return [resolveSpecifier(ghost, file, literal)];
    const targets = [
      resolveTarget(ghost, normalize(literal)),
      resolveTarget(ghost, normalize(posix.join(posix.dirname(file), literal))),
    ];
    for (const [prefix, directory, suffix = ''] of aliases) {
      if (!literal.startsWith(prefix)) continue;
      const target = normalize(directory + literal.slice(prefix.length));
      if (target) targets.push(ghost.tracked.has(target + suffix) ? target + suffix : null);
      targets.push(resolveTarget(ghost, target));
    }
    return targets;
  };
  for (const file of index.files) {
    if (gone.has(file) || !(CODE.test(file) || LISTING.test(file))) continue;
    const source = index.source(file);
    if (!stems.some((stem) => source.includes(stem))) continue;
    if (LISTING.test(file)) {
      if ([...gone].some((path) => source.includes(path))) {
        result.listing = { file, path: [...gone].find((path) => source.includes(path)) };
        return result;
      }
      continue;
    }
    for (const [, , literal] of source.matchAll(STRING))
      if (targetsOf(file, literal).some((target) => target && gone.has(target))) {
        result.files.push(file);
        break;
      }
  }
  result.files.sort();
  return result;
}
