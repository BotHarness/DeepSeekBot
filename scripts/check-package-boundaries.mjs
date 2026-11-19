import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';

const cliAdapter = /^packages\/core\/src\/bots\/cli-[^/]+\.[cm]?[jt]s$/u;
const operationalDatabase = /^packages\/core\/src\/(?:database\/|channels\/sqlite-store\.)/u;

const CLIENT_HOST_BASELINE = 'scripts/client-host-import-baseline.json';

export function packageBoundaryErrors(file, source, workspaces = new Map(), existingImports = {}) {
  if (!file.startsWith('packages/')) return [];
  const ast = parse(source, {
    createImportExpressions: true,
    sourceFilename: file,
    sourceType: 'unambiguous',
    plugins: [
      ['typescript', { dts: /\.d\.[cm]?ts$/u.test(file) }],
      ...(file.endsWith('x') ? ['jsx'] : []),
    ],
  });
  const errors = [];
  const clientHostImports = new Map();
  const queue = [ast];
  while (queue.length) {
    const node = queue.pop();
    let input;
    if (node.type === 'TSExternalModuleReference') input = node.expression;
    if (node.type === 'TSImportType') input = node.argument;
    if (
      [
        'ImportDeclaration',
        'ExportNamedDeclaration',
        'ExportAllDeclaration',
        'ImportExpression',
      ].includes(node.type)
    )
      input = node.source;
    if (
      node.type === 'CallExpression' &&
      ((node.callee.type === 'Identifier' && node.callee.name === 'require') ||
        (node.callee.type === 'MemberExpression' && node.callee.object.name === 'require'))
    )
      input = node.arguments[0];
    if (input?.type === 'StringLiteral') {
      const specifier = input.value;
      const name = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];
      const workspace = workspaces.get(name);
      const target = specifier.startsWith('.')
        ? posix.normalize(posix.join(posix.dirname(file), specifier))
        : workspace
          ? `${workspace}/${specifier.slice(name.length + 1)}`
          : specifier.startsWith('apps/') || specifier.startsWith('packages/')
            ? specifier
            : undefined;
      if (target?.startsWith('apps/'))
        errors.push(
          `${file}:${input.loc.start.line}: packages must not import apps (${specifier})`,
        );
      if (
        file.startsWith('packages/core/') &&
        (target?.startsWith('packages/client/') || name === '@botharness/ui')
      )
        errors.push(
          `${file}:${input.loc.start.line}: core must not import client source (${specifier})`,
        );
      if (
        (cliAdapter.test(file) || file.startsWith('packages/host-client/src/')) &&
        ((target && operationalDatabase.test(target)) ||
          name === 'node:sqlite' ||
          name === 'better-sqlite3')
      )
        errors.push(
          `${file}:${input.loc.start.line}: CLI adapters must use the Host for operational database access (${specifier})`,
        );
      if (
        file.startsWith('packages/client/src/') &&
        (target === 'packages/core' ||
          target?.startsWith('packages/core/') ||
          name === '@botharness/core')
      ) {
        const count = (clientHostImports.get(specifier) ?? 0) + 1;
        clientHostImports.set(specifier, count);
        if (count > (existingImports[specifier] ?? 0))
          errors.push(
            `${file}:${input.loc.start.line}: client source must use Host RPC or shared contracts (${specifier}); see docs/decisions/desktop-ui.md#adr-0023`,
          );
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) queue.push(...value.filter((child) => child?.type));
      else if (value?.type) queue.push(value);
    }
  }
  for (const [specifier, allowed] of Object.entries(existingImports)) {
    if ((clientHostImports.get(specifier) ?? 0) < allowed)
      errors.push(`${file}: shrink ${CLIENT_HOST_BASELINE} for ${specifier}`);
  }
  return errors;
}

function clientHostBaselineErrors(root, files, baseline) {
  const errors = Object.keys(baseline)
    .filter((file) => !files.includes(file))
    .map((file) => `${file}: remove the retired entry from ${CLIENT_HOST_BASELINE}`);
  const requested = process.env.BASELINE_BASE;
  const base = !requested ? 'origin/main' : /^0+$/u.test(requested) ? 'HEAD^' : requested;
  const prior = spawnSync('git', ['show', `${base}:${CLIENT_HOST_BASELINE}`], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (prior.status !== 0 && !/does not exist in|exists on disk, but not in/u.test(prior.stderr)) {
    const message = `${CLIENT_HOST_BASELINE}: cannot read the baseline at ${base} to check that it only shrinks; fetch it or set BASELINE_BASE to the PR base commit`;
    if (requested) errors.push(message);
    else console.warn(`warning: ${message}`);
  }
  if (prior.status === 0) {
    const previous = JSON.parse(prior.stdout);
    for (const [file, specifiers] of Object.entries(baseline)) {
      for (const [specifier, count] of Object.entries(specifiers)) {
        if (count > (previous[file]?.[specifier] ?? 0))
          errors.push(`${file}: ${CLIENT_HOST_BASELINE} may only shrink (${specifier})`);
      }
    }
  }
  return errors;
}

export function checkPackageBoundaries(root) {
  const baseline = JSON.parse(readFileSync(resolve(root, CLIENT_HOST_BASELINE), 'utf8'));
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8', windowsHide: true },
  )
    .split('\0')
    .filter((file) => file && existsSync(resolve(root, file)));
  const workspaces = new Map();
  for (const file of files.filter((file) =>
    /^(?:apps|packages)\/[^/]+\/package\.json$/u.test(file),
  )) {
    const manifest = JSON.parse(readFileSync(resolve(root, file), 'utf8'));
    workspaces.set(manifest.name, posix.dirname(file));
  }
  const boundaryErrors = files
    .filter((file) => /^packages\/.*\.[cm]?[jt]sx?$/u.test(file))
    .flatMap((file) =>
      (() => {
        try {
          return packageBoundaryErrors(
            file,
            readFileSync(resolve(root, file), 'utf8'),
            workspaces,
            baseline[file],
          );
        } catch (error) {
          throw new Error(`${file}: ${error.message}`, { cause: error });
        }
      })(),
    );
  return [...boundaryErrors, ...clientHostBaselineErrors(root, files, baseline)];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const errors = checkPackageBoundaries(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log('package boundaries: app, core/client and CLI database boundaries hold');
}
