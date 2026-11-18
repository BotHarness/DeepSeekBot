import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';

export function packageBoundaryErrors(file, source, workspaces = new Map()) {
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
  const queue = [ast];
  while (queue.length) {
    const node = queue.pop();
    let input;
    if (node.type === 'TSExternalModuleReference') input = node.expression;
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
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) queue.push(...value.filter((child) => child?.type));
      else if (value?.type) queue.push(value);
    }
  }
  return errors;
}

export function checkPackageBoundaries(root) {
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
  return files
    .filter((file) => /^packages\/.*\.[cm]?[jt]sx?$/u.test(file))
    .flatMap((file) =>
      (() => {
        try {
          return packageBoundaryErrors(file, readFileSync(resolve(root, file), 'utf8'), workspaces);
        } catch (error) {
          throw new Error(`${file}: ${error.message}`, { cause: error });
        }
      })(),
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const errors = checkPackageBoundaries(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else
    console.log('package boundaries: packages do not import apps; core does not import client');
}
