#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BASELINE = 'scripts/host-reader-baseline.json';
export const SHARED = 'packages/host-client/src/';
export const SIDES = {
  desktop: ['packages/client/src/'],
  mobile: ['apps/mobile/src/', 'apps/mobile/app/', SHARED],
};

const GENERIC = String.raw`(?:<(?:[^<>()]|<[^<>()]*>)*>)?`;
const METHOD = String.raw`'([A-Za-z][\w/.-]*)'`;
const CALL = new RegExp(
  String.raw`\b(?:call|invoke|rpc)\s*${GENERIC}\(\s*${METHOD}|\bunwrap\(\s*[\w.]+,\s*${METHOD}`,
  'gu',
);

export function hostMethods(source) {
  return new Set([...source.matchAll(CALL)].map((match) => match[1] ?? match[2]));
}

export const sideOf = (path) =>
  Object.keys(SIDES).find((side) => SIDES[side].some((prefix) => path.startsWith(prefix)));

export function readersByMethod(files) {
  const readers = {};
  for (const [path, source] of Object.entries(files)) {
    const side = sideOf(path);
    if (side === undefined) continue;
    for (const method of hostMethods(source)) ((readers[method] ??= {})[side] ??= []).push(path);
  }
  return readers;
}

export const duplicated = (readers) =>
  Object.keys(readers)
    .filter((method) => readers[method].desktop && readers[method].mobile)
    .sort();

export function checkHostReaders(readers, baseline) {
  const allowed = new Set(baseline);
  const now = duplicated(readers);
  const errors = now
    .filter((method) => !allowed.has(method))
    .map(
      (method) =>
        `Host method '${method}' is read on desktop (${readers[method].desktop.join(', ')}) and on mobile (${readers[method].mobile.join(', ')}). Fix: keep one reader in ${SHARED} that parses the answer from unknown, call it from both (desktop passes bridgeHost(call) from packages/client/src/client/bridge.ts), and delete the other reader.`,
    );
  const stale = baseline.filter((method) => !now.includes(method));
  if (stale.length)
    errors.push(
      `${BASELINE} still lists ${stale.join(', ')}, now read in one place. Lower it with \`node scripts/check-host-readers.mjs --update\` (it never raises).`,
    );
  return errors;
}

function trackedSources(root) {
  const prefixes = Object.values(SIDES).flat();
  const result = spawnSync('git', ['ls-files', '-z', '--', ...prefixes], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return Object.fromEntries(
    result.stdout
      .split('\0')
      .filter((path) => /\.(?:ts|tsx)$/u.test(path) && !/\.d\.ts$|\.test\.tsx?$/u.test(path))
      .map((path) => [path, readFileSync(join(root, path), 'utf8')]),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..');
  const readers = readersByMethod(trackedSources(root));
  const baseline = JSON.parse(readFileSync(join(root, BASELINE), 'utf8'));
  if (process.argv.includes('--update')) {
    const now = new Set(duplicated(readers));
    const next = baseline.filter((method) => now.has(method));
    writeFileSync(join(root, BASELINE), `${JSON.stringify(next, null, 2)}\n`);
    console.log(`host readers: ${next.length} baselined methods`);
  } else {
    const errors = checkHostReaders(readers, baseline);
    for (const error of errors) console.error(`host readers: ${error}`);
    if (errors.length) process.exitCode = 1;
    else
      console.log(
        `host readers: no new Host method read separately on desktop and mobile (${baseline.length} baselined)`,
      );
  }
}
