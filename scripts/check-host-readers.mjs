#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';

export const BASELINE = 'scripts/host-reader-baseline.json';
export const SHARED = 'packages/host-client/src/';
export const SIDES = {
  desktop: ['packages/client/src/'],
  mobile: ['apps/mobile/src/', 'apps/mobile/app/'],
  shared: [SHARED],
};

const HOST_CALLS = new Set(['call', 'invoke', 'rpc']);

const calleeName = (node) =>
  node.type === 'Identifier'
    ? node.name
    : node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier'
      ? node.property.name
      : undefined;

const literal = (node) =>
  node?.type === 'StringLiteral'
    ? node.value
    : node?.type === 'TemplateLiteral' && node.expressions.length === 0
      ? node.quasis[0].value.cooked
      : undefined;

export function hostMethods(source, path = 'source.tsx') {
  const found = new Set();
  const visit = (node) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (node.type === 'CallExpression') {
      const name = calleeName(node.callee);
      const method = HOST_CALLS.has(name)
        ? literal(node.arguments[0])
        : name === 'unwrap'
          ? literal(node.arguments[1])
          : undefined;
      if (method !== undefined && /^[A-Za-z][\w/.-]*$/u.test(method)) found.add(method);
    }
    for (const key of Object.keys(node))
      if (
        !['loc', 'start', 'end', 'leadingComments', 'trailingComments', 'innerComments'].includes(
          key,
        )
      )
        visit(node[key]);
  };
  visit(
    parse(source, {
      sourceType: 'module',
      plugins: /\.tsx$/u.test(path) ? ['typescript', 'jsx'] : ['typescript'],
      errorRecovery: true,
    }).program,
  );
  return found;
}

export const sideOf = (path) =>
  Object.keys(SIDES).find((side) => SIDES[side].some((prefix) => path.startsWith(prefix)));

export function readersByMethod(files) {
  const readers = {};
  for (const [path, source] of Object.entries(files)) {
    const side = sideOf(path);
    if (side === undefined) continue;
    for (const method of hostMethods(source, path))
      ((readers[method] ??= {})[side] ??= []).push(path);
  }
  return readers;
}

export const duplicated = (readers) =>
  Object.keys(readers)
    .filter((method) => Object.keys(readers[method]).length > 1)
    .sort();

const where = (readers, method) =>
  Object.entries(readers[method])
    .map(([side, paths]) => `${side} (${paths.join(', ')})`)
    .join(' and ');

export function checkHostReaders(readers, baseline) {
  const allowed = new Set(baseline);
  const now = duplicated(readers);
  const errors = now
    .filter((method) => !allowed.has(method))
    .map(
      (method) =>
        `Host method '${method}' is read separately on ${where(readers, method)}. Fix: keep one reader in ${SHARED} that parses the answer from unknown, call it from both (desktop passes bridgeHost(call) from packages/client/src/client/bridge.ts), and delete the other reader.`,
    );
  const stale = baseline.filter((method) => !now.includes(method));
  if (stale.length)
    errors.push(
      `${BASELINE} still lists ${stale.join(', ')}, now read in one place. Lower it with \`node scripts/check-host-readers.mjs --update\` (it never raises).`,
    );
  return errors;
}

function git(root, args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result;
}

function sources(root) {
  const prefixes = Object.values(SIDES).flat();
  const listed = git(root, [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    ...prefixes,
  ]);
  if (listed.status !== 0)
    throw new Error(`git ls-files failed (${listed.status}): ${listed.stderr.trim()}`);
  return Object.fromEntries(
    [...new Set(listed.stdout.split('\0'))]
      .filter((path) => /\.(?:ts|tsx)$/u.test(path) && !/\.d\.ts$|\.test\.tsx?$/u.test(path))
      .flatMap((path) => {
        const text = sourceText(join(root, path));
        return text === undefined ? [] : [[path, text]];
      }),
  );
}

function sourceText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

export function addedToBaseline(baseline, base) {
  if (base === undefined) return [];
  const known = new Set(base);
  return baseline.filter((method) => !known.has(method));
}

function baselineAt(root, revision, required) {
  if (git(root, ['cat-file', '-e', `${revision}^{commit}`]).status !== 0) {
    if (required) throw new Error(`cannot read revision ${revision}; fetch it first`);
    return undefined;
  }
  const shown = git(root, ['show', `${revision}:${BASELINE}`]);
  return shown.status === 0 ? JSON.parse(shown.stdout) : undefined;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..');
  const readers = readersByMethod(sources(root));
  const baseline = JSON.parse(readFileSync(join(root, BASELINE), 'utf8'));
  if (process.argv.includes('--update')) {
    const now = new Set(duplicated(readers));
    const next = baseline.filter((method) => now.has(method));
    writeFileSync(join(root, BASELINE), `${JSON.stringify(next, null, 2)}\n`);
    console.log(`host readers: ${next.length} baselined methods`);
  } else {
    const errors = checkHostReaders(readers, baseline);
    const base = process.argv.find((arg) => arg.startsWith('--base='))?.slice('--base='.length);
    const added = addedToBaseline(
      baseline,
      baselineAt(root, base ?? 'origin/main', base !== undefined),
    );
    if (added.length)
      errors.push(
        `${BASELINE} adds ${added.join(', ')}, which the base does not list. The baseline only shrinks: give each of these methods one reader instead.`,
      );
    for (const error of errors) console.error(`host readers: ${error}`);
    if (errors.length) process.exitCode = 1;
    else
      console.log(
        `host readers: no new Host method read in two places (${baseline.length} baselined)`,
      );
  }
}
