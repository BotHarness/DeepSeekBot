import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { pnpmCommand } from './dev-package-manager.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEST =
  /^(?:packages\/[^/]+\/test\/.+\.test\.tsx?|apps\/docs\/test\/.+\.test\.ts|apps\/mobile\/test\/.+\.test\.tsx?|scripts\/test\/.+\.test\.mjs)$/;
const KEEP =
  /(?:^|\/)(?:test|tests|__fixtures__)\/|(?:^|\/)(?:package\.json|pnpm-lock\.yaml)$|^changes\//;

export const isFix = (title) => /^fix(?:\([^)]*\))?!?:/i.test(title.trim());

export const waiver = (body) => /^No regression test:[ \t]*(\S.*)$/im.exec(body ?? '')?.[1].trim();

export const isTest = (path) => TEST.test(path);

export function parseChanges(nameStatus) {
  const fields = nameStatus.split('\0').filter(Boolean);
  const changes = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (status.startsWith('R') || status.startsWith('C')) {
      changes.push({ status: status[0], from: fields[index++], path: fields[index++] });
    } else {
      changes.push({ status: status[0], path: fields[index++] });
    }
  }
  return changes;
}

export function revertPlan(changes) {
  const fromBase = [];
  const remove = [];
  for (const change of changes) {
    if (KEEP.test(change.path) && (!change.from || KEEP.test(change.from))) continue;
    if (change.status === 'A' || change.status === 'C') remove.push(change.path);
    else if (change.status === 'R') {
      remove.push(change.path);
      fromBase.push(change.from);
    } else fromBase.push(change.path);
  }
  return { fromBase, remove };
}

export function outcomes(report, root) {
  const results = new Map();
  for (const file of report.testResults ?? []) {
    const path = relative(root, file.name).replaceAll('\\', '/');
    for (const test of file.assertionResults ?? [])
      results.set(`${path} > ${test.fullName}`, test.status);
  }
  return results;
}

export function proof(head, base) {
  return [...head]
    .filter(([name, status]) => status === 'passed' && base.get(name) === 'failed')
    .map(([name]) => name);
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true });
}

function vitest(files, out) {
  const [command, args] = pnpmCommand([
    'exec',
    'vitest',
    'run',
    '--reporter=json',
    `--outputFile=${out}`,
    ...files,
  ]);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (!existsSync(out)) return new Map();
  return outcomes(JSON.parse(readFileSync(out, 'utf8')), ROOT);
}

export function check({ base, title, body }) {
  if (!isFix(title))
    return { ok: true, message: `not a fix PR (${JSON.stringify(title)}); nothing to prove` };
  const reason = waiver(body);
  if (reason) return { ok: true, message: `waived: ${reason}` };
  const changes = parseChanges(git(['diff', '--name-status', '-z', '-M', base, 'HEAD']));
  const tests = changes
    .filter((change) => change.status !== 'D' && isTest(change.path))
    .map((change) => change.path);
  const help =
    'A fix PR adds or changes a test that fails without the fix and passes with it. If no automated test can show the bug, write `No regression test: <why>` in the PR description.';
  if (!tests.length) return { ok: false, message: `no changed test file. ${help}` };
  const { fromBase, remove } = revertPlan(changes);
  const touched = [...fromBase, ...remove];
  if (!touched.length)
    return {
      ok: false,
      message: `the PR changes only tests, so there is no fix to remove. ${help}`,
    };
  if (git(['status', '--porcelain', '--untracked-files=no']).trim())
    return {
      ok: false,
      message:
        'the working tree or index has uncommitted changes; the proof must run on the committed PR, so commit or stash them first',
    };
  const dir = mkdtempSync(join(tmpdir(), 'regression-proof-'));
  try {
    const head = vitest(tests, join(dir, 'head.json'));
    try {
      if (fromBase.length) git(['checkout', base, '--', ...fromBase]);
      for (const path of remove) rmSync(join(ROOT, path), { force: true });
      const without = vitest(tests, join(dir, 'base.json'));
      const proven = proof(head, without);
      if (proven.length)
        return {
          ok: true,
          message: `fails without the fix, passes with it:\n${proven.map((name) => `  ${name}`).join('\n')}`,
        };
      return {
        ok: false,
        message: `no test in ${tests.join(', ')} both passes with the fix and fails without it (a test file that cannot load without the fix does not count). ${help}`,
      };
    } finally {
      git(['reset', '-q', 'HEAD', '--', ...touched]);
      const existing = new Set(
        changes.filter((change) => change.status !== 'D').map((change) => change.path),
      );
      const back = touched.filter((path) => existing.has(path));
      if (back.length) git(['checkout', 'HEAD', '--', ...back]);
      for (const path of touched.filter((path) => !existing.has(path)))
        rmSync(join(ROOT, path), { force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const { values } = parseArgs({
      options: {
        base: { type: 'string' },
        title: { type: 'string' },
        'body-file': { type: 'string' },
      },
    });
    if (!values.base || values.title === undefined)
      throw new Error(
        'Usage: node scripts/check-regression-proof.mjs --base <commit> --title <PR title> [--body-file <path>]',
      );
    const body = values['body-file'] ? readFileSync(values['body-file'], 'utf8') : '';
    const result = check({ base: values.base, title: values.title, body });
    (result.ok ? process.stdout : process.stderr).write(`regression-proof: ${result.message}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`regression-proof: ${error.message}\n`);
    process.exitCode = 1;
  }
}
