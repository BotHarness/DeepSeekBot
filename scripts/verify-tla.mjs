#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MODELS = join(root, 'verification');
export const TLA2TOOLS = {
  version: '1.7.4',
  url: 'https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar',
  sha256: '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88',
};

export function expectation(config) {
  return /^\\\*\s*expect:\s*(\w+)\s*$/mu.exec(config)?.[1];
}

export function outcome(output) {
  const broken = /Invariant (\w+) is violated/u.exec(output)?.[1];
  if (broken) return { broken };
  if (/Model checking completed\. No error has been found\./u.test(output)) return { passed: true };
  return {
    error:
      output.split('\n').filter((line) => /Error|error/u.test(line))[0] ?? 'TLC did not finish',
  };
}

export function verdict(expected, result) {
  if (result.error) return `TLC failed: ${result.error}`;
  if (expected === undefined)
    return result.broken ? `breaks ${result.broken}; see the trace above` : undefined;
  if (result.passed) return `expected ${expected} to break, but every state keeps it`;
  return result.broken === expected
    ? undefined
    : `expected ${expected} to break, but ${result.broken} broke`;
}

async function tools() {
  if (process.env.TLA2TOOLS) return process.env.TLA2TOOLS;
  const cache = join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'botharness', 'tla');
  const jar = join(cache, `tla2tools-${TLA2TOOLS.version}.jar`);
  const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
  if (existsSync(jar) && sha(readFileSync(jar)) === TLA2TOOLS.sha256) return jar;
  const response = await fetch(TLA2TOOLS.url);
  if (!response.ok)
    throw new Error(`Could not download tla2tools.jar: HTTP ${String(response.status)}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha(bytes) !== TLA2TOOLS.sha256)
    throw new Error(`tla2tools.jar ${TLA2TOOLS.version} does not match its pinned sha256`);
  mkdirSync(cache, { recursive: true });
  writeFileSync(`${jar}.part`, bytes);
  renameSync(`${jar}.part`, jar);
  return jar;
}

export function models(only) {
  return readdirSync(MODELS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && (only.length === 0 || only.includes(entry.name)))
    .flatMap((entry) => {
      const folder = join(MODELS, entry.name);
      const specs = readdirSync(folder).filter((name) => name.endsWith('.tla'));
      if (specs.length !== 1) throw new Error(`${entry.name}: expected one .tla file`);
      return readdirSync(folder)
        .filter((name) => name.endsWith('.cfg'))
        .sort()
        .map((config) => ({ folder, spec: specs[0], config }));
    });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const jar = await tools();
  const java = process.env.JAVA ?? 'java';
  let failed = 0;
  for (const { folder, spec, config } of models(process.argv.slice(2))) {
    const name = `${basename(folder)}/${config}`;
    const run = spawnSync(
      java,
      [
        '-XX:+UseParallelGC',
        '-cp',
        jar,
        'tlc2.TLC',
        '-workers',
        'auto',
        '-deadlock',
        '-metadir',
        join(tmpdir(), `botharness-tlc-${process.pid}`, name),
        '-config',
        config,
        spec,
      ],
      { cwd: folder, encoding: 'utf8', shell: false, windowsHide: true },
    );
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    const expected = expectation(readFileSync(join(folder, config), 'utf8'));
    const problem = run.error
      ? `could not run ${java}: ${run.error.message}`
      : verdict(expected, outcome(output));
    if (problem) {
      failed += 1;
      console.error(output);
      console.error(`verify-tla: ${name}: ${problem}`);
    } else
      console.log(
        `verify-tla: ${name}: ${expected ? `breaks ${expected} as expected` : 'every invariant holds'}`,
      );
  }
  if (failed) process.exit(1);
}
