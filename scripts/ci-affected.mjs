import { appendFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DOCS_SITE_TEST, ROOT, SHARDS } from './ci-plan.mjs';
import { loadDurations } from './ci-test-durations.mjs';

export const SHARD_THRESHOLD = 60;
export const UNRECORDED_SECONDS = 0.2;

export function parseFiles(text) {
  const files = JSON.parse(text);
  if (
    !Array.isArray(files) ||
    files.some(
      (file) =>
        typeof file !== 'string' ||
        !file ||
        /[\\\0\r\n]/.test(file) ||
        isAbsolute(file) ||
        /^[a-z]:/i.test(file) ||
        file.split('/').some((part) => !part || part === '.' || part === '..'),
    )
  )
    throw new Error('Expected a JSON array of repository-relative file paths');
  return [...new Set(files)].sort();
}

export function partitionFiles(files, { seconds = loadDurations(), shards } = {}) {
  const selected = parseFiles(JSON.stringify(files));
  const count = selected.length;
  const include = Array.from(
    { length: count ? (shards ?? (count >= SHARD_THRESHOLD ? SHARDS : 1)) : 0 },
    (_, index) => ({ shard: index + 1, files: [] }),
  );
  const weight = (file) => seconds[file] ?? UNRECORDED_SECONDS;
  const load = include.map(() => 0);
  for (const file of [...selected].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b))) {
    const lightest = load.indexOf(Math.min(...load));
    include[lightest].files.push(file);
    load[lightest] += weight(file);
  }
  for (const shard of include) shard.files.sort();
  return { count, matrix: { include } };
}

async function createRunner(options) {
  const { createVitest } = await import('vitest/node');
  return createVitest(options);
}

function repositoryPath(root, moduleId) {
  if (typeof moduleId !== 'string' || !isAbsolute(moduleId))
    throw new Error('Vitest returned an invalid test module path');
  return parseFiles(JSON.stringify([relative(root, moduleId).replaceAll('\\', '/')]))[0];
}

export async function selectAffected(inputs, { root = ROOT, create = createRunner } = {}) {
  const related = parseFiles(JSON.stringify(inputs));
  if (!related.length) return partitionFiles([]);
  const runner = await create({
    root,
    watch: false,
    run: true,
    related,
    project: ['!docs-site'],
  });
  try {
    const specs = await runner.getRelevantTestSpecifications();
    return partitionFiles(
      specs
        .map((spec) => repositoryPath(root, spec.moduleId))
        .filter((file) => file !== DOCS_SITE_TEST),
    );
  } finally {
    await runner.close();
  }
}

export async function selectFull({ root = ROOT, create = createRunner } = {}) {
  const runner = await create({ root, watch: false, run: true, project: ['!docs-site'] });
  try {
    const specs = await runner.globTestSpecifications();
    return partitionFiles(
      specs
        .map((spec) => repositoryPath(root, spec.moduleId))
        .filter((file) => file !== DOCS_SITE_TEST),
      { shards: SHARDS },
    );
  } finally {
    await runner.close();
  }
}

export async function runSelected(inputs, { root = ROOT, create = createRunner } = {}) {
  const files = parseFiles(JSON.stringify(inputs));
  if (!files.length || files.includes(DOCS_SITE_TEST))
    throw new Error('A test shard must contain tests and must exclude the docs-site test');
  const wanted = new Set(files);
  const runner = await create({ root, watch: false, run: true, project: ['!docs-site'] });
  try {
    await runner.standalone();
    const specs = (await runner.globTestSpecifications()).filter((spec) =>
      wanted.has(repositoryPath(root, spec.moduleId)),
    );
    const found = new Set(specs.map((spec) => repositoryPath(root, spec.moduleId)));
    const missing = files.filter((file) => !found.has(file));
    if (missing.length) throw new Error(`Selected tests are missing: ${missing.join(', ')}`);
    const result = await runner.runTestSpecifications(specs);
    const completed = new Set(
      result.testModules.map((module) => repositoryPath(root, module.moduleId)),
    );
    if (
      result.unhandledErrors.length ||
      result.testModules.some((module) => !module.ok()) ||
      files.some((file) => !completed.has(file))
    )
      throw new Error('The affected test shard failed or did not complete every selected file');
  } finally {
    await runner.close();
  }
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    if (
      process.argv.length === 3 &&
      (process.argv[2] === '--select' || process.argv[2] === '--select-full')
    ) {
      const result =
        process.argv[2] === '--select'
          ? await selectAffected(parseFiles(process.env.RELATED))
          : await selectFull();
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(
          process.env.GITHUB_OUTPUT,
          `matrix=${JSON.stringify(result.matrix)}\ncount=${result.count}\nshards=${result.matrix.include.length}\n`,
        );
      console.log(JSON.stringify(result));
    } else if (process.argv.length === 3 && process.argv[2] === '--run') {
      await runSelected(parseFiles(process.env.TEST_FILES));
    } else
      throw new Error(
        'Usage: ci-affected.mjs --select (RELATED) | --select-full | --run (TEST_FILES)',
      );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
