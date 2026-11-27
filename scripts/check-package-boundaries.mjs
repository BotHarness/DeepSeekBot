import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';
import { compareBaselineCounts, countsByRule } from './baseline-counts.mjs';
import {
  CORE_LAYER_BASELINE,
  CORE_SOURCE,
  coreLayerImport,
  coreLayerInventory,
  describeCoreLayerGrowth,
  isCoreRuntimeFile,
  unclassifiedCoreDirectory,
  unclassifiedCoreTopLevelFile,
} from './core-layer-order.mjs';

const cliSource = `${CORE_SOURCE}/cli/`;
const personaBotLifecycle = /^packages\/core\/src\/bots\/(?:registry|deletion)\.ts$/u;
const permissionsModule = 'packages/core/src/messaging/permissions/';
const operationalDatabase = /^packages\/core\/src\/(?:database\/|channels\/sqlite-store\.)/u;

const CLIENT_HOST_BASELINE = 'scripts/client-host-import-baseline.json';
const KERNEL_SOURCE = `${CORE_SOURCE}/kernel/`;
const TEAM_POLICY_SOURCE = `${CORE_SOURCE}/team-policy/`;

function isRuntimeImport(node) {
  switch (node.type) {
    case 'ImportDeclaration':
      return node.importKind !== 'type';
    case 'ExportNamedDeclaration':
      return Boolean(node.source) && node.exportKind !== 'type';
    case 'ExportAllDeclaration':
      return node.exportKind !== 'type';
    case 'TSImportEqualsDeclaration':
      return node.importKind !== 'type';
    case 'ImportExpression':
      return true;
    case 'CallExpression':
      return node.callee.type === 'Identifier' && node.callee.name === 'require';
    default:
      return false;
  }
}

function inspectPackageBoundaries(file, source, workspaces) {
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
  const coreImports = new Map();
  const coreRuntimeFile = isCoreRuntimeFile(file);
  const queue = [ast];
  while (queue.length) {
    const node = queue.pop();
    let input;
    if (node.type === 'TSImportEqualsDeclaration') input = node.moduleReference.expression;
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
    const staticSpecifier =
      input?.type === 'StringLiteral'
        ? input.value
        : input?.type === 'TemplateLiteral' && input.expressions.length === 0
          ? input.quasis[0].value.cooked
          : undefined;
    const relativeTarget = staticSpecifier?.startsWith('.')
      ? posix.normalize(posix.join(posix.dirname(file), staticSpecifier))
      : undefined;
    if (staticSpecifier && file.startsWith(KERNEL_SOURCE)) {
      const kernelTarget = relativeTarget ?? staticSpecifier;
      if (
        kernelTarget === CORE_SOURCE ||
        (kernelTarget.startsWith(`${CORE_SOURCE}/`) && !kernelTarget.startsWith(KERNEL_SOURCE)) ||
        kernelTarget === '@botharness/core' ||
        kernelTarget.startsWith('@botharness/core/')
      )
        errors.push(
          `${file}:${input.loc.start.line}: Kernel must not depend on another Host core module (${staticSpecifier})`,
        );
    }
    if (staticSpecifier && file.startsWith(TEAM_POLICY_SOURCE)) {
      const target = relativeTarget ?? staticSpecifier;
      const internal =
        target === CORE_SOURCE ||
        target.startsWith(`${CORE_SOURCE}/`) ||
        target === '@botharness/core' ||
        target.startsWith('@botharness/core/');
      if (internal && !target.startsWith(TEAM_POLICY_SOURCE) && !target.startsWith(KERNEL_SOURCE)) {
        errors.push(
          `${file}:${input.loc.start.line}: Team Policy may only depend on Kernel within Host core (${staticSpecifier})`,
        );
      }
    }
    if (coreRuntimeFile && relativeTarget && isRuntimeImport(node)) {
      const direction = coreLayerImport(file, relativeTarget);
      if (direction) coreImports.set(direction, (coreImports.get(direction) ?? 0) + 1);
    }
    if (input?.type === 'StringLiteral') {
      const specifier = input.value;
      const name = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];
      const workspace = workspaces.get(name);
      const target =
        relativeTarget ??
        (workspace
          ? `${workspace}/${specifier.slice(name.length + 1)}`
          : specifier.startsWith('apps/') || specifier.startsWith('packages/')
            ? specifier
            : undefined);
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
        (file.startsWith(cliSource) || file.startsWith('packages/host-client/src/')) &&
        ((target && operationalDatabase.test(target)) ||
          name === 'node:sqlite' ||
          name === 'better-sqlite3')
      )
        errors.push(
          `${file}:${input.loc.start.line}: CLI adapters must use the Host for operational database access (${specifier})`,
        );
      if (personaBotLifecycle.test(file) && target?.startsWith(`${CORE_SOURCE}/tob/`))
        errors.push(
          `${file}:${input.loc.start.line}: PersonaBot lifecycle must use record protection policy (${specifier})`,
        );
      const permissionsEntry = file.startsWith('packages/client/')
        ? `${permissionsModule}client.js`
        : `${permissionsModule}index.js`;
      if (
        target?.startsWith(permissionsModule) &&
        target !== permissionsEntry &&
        !file.startsWith(permissionsModule)
      )
        errors.push(
          `${file}:${input.loc.start.line}: import messaging permissions through ${permissionsEntry.slice(permissionsModule.length)} (${specifier})`,
        );
      if (
        file.startsWith('packages/client/src/') &&
        (target === 'packages/core' ||
          target?.startsWith('packages/core/') ||
          name === '@botharness/core')
      ) {
        clientHostImports.set(specifier, (clientHostImports.get(specifier) ?? 0) + 1);
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) queue.push(...value.filter((child) => child?.type));
      else if (value?.type) queue.push(value);
    }
  }
  return { errors, clientHostImports, coreImports };
}

const movedClientHostTargets = new Map(
  [
    'sender-access',
    'permission-groups',
    'behavior-policy',
    'behavior-permissions',
    'group-policy',
    'thread-policy',
  ].map((name) => [`packages/core/src/messaging/${name}.js`, `${permissionsModule}client.js`]),
);

function clientHostRule(file, specifier) {
  const target = specifier.startsWith('.')
    ? posix.normalize(posix.join(posix.dirname(file), specifier))
    : specifier;
  return movedClientHostTargets.get(target) ?? target;
}

function compareClientHostImports(current, previous) {
  return compareBaselineCounts(
    countsByRule(current, clientHostRule),
    countsByRule(previous, clientHostRule),
  );
}

function describeClientHostGrowth(message) {
  return `${message}; client source must use Host RPC or shared contracts (docs/decisions/desktop-ui.md#adr-0023)`;
}

export function packageBoundaryErrors(file, source, workspaces = new Map()) {
  if (!file.startsWith('packages/')) return [];
  const { errors, clientHostImports } = inspectPackageBoundaries(file, source, workspaces);
  const { grown } = compareClientHostImports({ [file]: Object.fromEntries(clientHostImports) }, {});
  return [...errors, ...grown.map(({ message }) => describeClientHostGrowth(message))];
}

function readBaselineAtBase(root, path, errors) {
  const requested = process.env.BASELINE_BASE;
  const base = !requested ? 'origin/main' : /^0+$/u.test(requested) ? 'HEAD^' : requested;
  const prior = spawnSync('git', ['show', `${base}:${path}`], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
  if (prior.status === 0) return { baseline: JSON.parse(prior.stdout) };
  if (/does not exist in|exists on disk, but not in/u.test(prior.stderr))
    return { missingAt: base };
  const message = `${path}: cannot read the baseline at ${base} to check that it only shrinks; fetch it or set BASELINE_BASE to the PR base commit`;
  if (requested) errors.push(message);
  else console.warn(`warning: ${message}`);
  return {};
}

function coreBaselineFromSource(root, base) {
  const gitOptions = { cwd: root, windowsHide: true, shell: false };
  const tree = execFileSync('git', ['ls-tree', '-rz', base, '--', CORE_SOURCE], {
    ...gitOptions,
    encoding: 'utf8',
  });
  const files = tree.split('\0').flatMap((entry) => {
    const tab = entry.indexOf('\t');
    const [mode, type, oid] = entry.slice(0, tab).split(' ');
    const file = entry.slice(tab + 1);
    return type === 'blob' && mode !== '120000' && isCoreRuntimeFile(file) ? [{ file, oid }] : [];
  });
  if (!files.length) return coreLayerInventory({});
  const blobs = execFileSync('git', ['cat-file', '--batch'], {
    ...gitOptions,
    input: `${files.map(({ oid }) => oid).join('\n')}\n`,
    maxBuffer: 64 * 1024 * 1024,
  });
  const importsByFile = {};
  let offset = 0;
  for (const { file, oid } of files) {
    const headerEnd = blobs.indexOf(10, offset);
    const [blobOid, type, byteLength] = blobs.toString('utf8', offset, headerEnd).split(' ');
    if (blobOid !== oid || type !== 'blob') throw new Error(`${base}:${file}: expected a Git blob`);
    const start = headerEnd + 1;
    const end = start + Number(byteLength);
    const { coreImports } = inspectPackageBoundaries(
      file,
      blobs.toString('utf8', start, end),
      new Map(),
    );
    if (coreImports.size) importsByFile[file] = Object.fromEntries(coreImports);
    offset = end + 1;
  }
  return coreLayerInventory(importsByFile);
}

function checkCoreLayerBaseline(root, current, errors, update) {
  const path = resolve(root, CORE_LAYER_BASELINE);
  const prior = readBaselineAtBase(root, CORE_LAYER_BASELINE, errors);
  const base = prior.baseline ?? (prior.missingAt && coreBaselineFromSource(root, prior.missingAt));
  const updateHint = 'node scripts/check-package-boundaries.mjs --update';
  const local = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
  if (!local && (!update || !base)) {
    errors.push(`${CORE_LAYER_BASELINE}: missing; fetch the base commit and run ${updateHint}`);
    return;
  }
  for (const section of Object.keys(current)) {
    const actual = countsByRule(current[section]);
    const cap = update && base ? base : (local ?? base);
    const allowed = countsByRule(cap[section]);
    const { grown, shrunk } = compareBaselineCounts(actual, allowed);
    errors.push(...grown.map((entry) => describeCoreLayerGrowth(section, entry)));
    if (!update) {
      errors.push(
        ...shrunk.map((message) => `${message}; shrink ${CORE_LAYER_BASELINE} with ${updateHint}`),
      );
      if (base && local) {
        const { grown: baselineGrowth } = compareBaselineCounts(
          allowed,
          countsByRule(base[section]),
        );
        errors.push(
          ...baselineGrowth.map(
            (entry) => `${CORE_LAYER_BASELINE}: ${describeCoreLayerGrowth(section, entry)}`,
          ),
        );
      }
    }
  }
}

export function checkPackageBoundaries(root, { update = false } = {}) {
  const baseline = JSON.parse(readFileSync(resolve(root, CLIENT_HOST_BASELINE), 'utf8'));
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8', windowsHide: true, shell: false },
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
  const errors = [];
  const clientHostBase = readBaselineAtBase(root, CLIENT_HOST_BASELINE, errors).baseline;
  if (clientHostBase) {
    const { grown } = compareClientHostImports(baseline, clientHostBase);
    errors.push(...grown.map(({ message }) => `${CLIENT_HOST_BASELINE}: ${message}`));
  }
  const coreRoot = resolve(root, CORE_SOURCE);
  if (existsSync(coreRoot)) {
    for (const entry of readdirSync(coreRoot, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const error = entry.isDirectory()
        ? unclassifiedCoreDirectory(entry.name)
        : entry.isFile()
          ? unclassifiedCoreTopLevelFile(entry.name)
          : undefined;
      if (error) errors.push(error);
    }
  }
  const current = {};
  const coreImportsByFile = {};
  for (const file of files.filter((file) => /^packages\/.*\.[cm]?[jt]sx?$/u.test(file)).sort()) {
    try {
      const {
        errors: boundaryErrors,
        clientHostImports,
        coreImports,
      } = inspectPackageBoundaries(file, readFileSync(resolve(root, file), 'utf8'), workspaces);
      errors.push(...boundaryErrors);
      if (clientHostImports.size > 0)
        current[file] = Object.fromEntries([...clientHostImports].sort());
      if (coreImports.size > 0)
        coreImportsByFile[file] = Object.fromEntries([...coreImports].sort());
    } catch (error) {
      throw new Error(`${file}: ${error.message}`, { cause: error });
    }
  }
  const coreInventory = coreLayerInventory(coreImportsByFile);
  checkCoreLayerBaseline(root, coreInventory, errors, update);
  const { grown, shrunk } = compareClientHostImports(current, baseline);
  errors.push(...grown.map(({ message }) => describeClientHostGrowth(message)));
  if (!update) {
    errors.push(
      ...shrunk.map(
        (message) =>
          `${message}; shrink ${CLIENT_HOST_BASELINE} with node scripts/check-package-boundaries.mjs --update`,
      ),
    );
  } else if (errors.length === 0) {
    writeFileSync(resolve(root, CLIENT_HOST_BASELINE), `${JSON.stringify(current, null, 2)}\n`);
    writeFileSync(
      resolve(root, CORE_LAYER_BASELINE),
      `${JSON.stringify(coreInventory, null, 2)}\n`,
    );
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const errors = checkPackageBoundaries(resolve(dirname(fileURLToPath(import.meta.url)), '..'), {
    update: process.argv.includes('--update'),
  });
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else
    console.log('package boundaries: apps, core/client, CLI database and Host core layers hold');
}
