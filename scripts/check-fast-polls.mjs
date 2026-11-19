#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';

export const ALLOWLIST = 'scripts/fast-poll-allowlist.json';
export const FAST_MS = 10_000;
export const ROOTS = [
  'packages/client/src/',
  'packages/host-client/src/',
  'apps/mobile/src/',
  'apps/mobile/app/',
];
export const GUIDE = 'docs/agents/live-host-state.md';

const SKIP = new Set([
  'loc',
  'start',
  'end',
  'leadingComments',
  'trailingComments',
  'innerComments',
]);

const timerName = (callee) =>
  callee.type === 'Identifier'
    ? callee.name
    : callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property.type === 'Identifier'
      ? callee.property.name
      : undefined;

function numeric(node, parents, bindings, depth = 0) {
  if (node === undefined || node === null || depth > 20) return undefined;
  if (node.type === 'NumericLiteral') return node.value;
  if (node.type === 'Identifier') {
    const binding = lookup(node.name, parents, bindings);
    if (binding?.kind !== 'const') return undefined;
    return numeric(binding.init, binding.parents, bindings, depth + 1);
  }
  if (node.type === 'TSAsExpression' || node.type === 'ParenthesizedExpression')
    return numeric(node.expression, parents, bindings, depth + 1);
  if (node.type === 'BinaryExpression' && ['*', '+'].includes(node.operator)) {
    const left = numeric(node.left, parents, bindings, depth + 1);
    const right = numeric(node.right, parents, bindings, depth + 1);
    if (left === undefined || right === undefined) return undefined;
    return node.operator === '*' ? left * right : left + right;
  }
  return undefined;
}

const isScope = (node) =>
  [
    'Program',
    'BlockStatement',
    'StaticBlock',
    'ForStatement',
    'ForInStatement',
    'ForOfStatement',
    'SwitchStatement',
    'CatchClause',
  ].includes(node.type) || isFunction(node);

function lookup(name, parents, bindings) {
  for (let index = parents.length - 1; index >= 0; index -= 1) {
    const binding = bindings.get(parents[index])?.get(name);
    if (binding !== undefined) return binding;
  }
  return undefined;
}

function declare(bindings, scope, name, binding) {
  if (scope === undefined) return;
  if (!bindings.has(scope)) bindings.set(scope, new Map());
  bindings.get(scope).set(name, binding);
}

function collectBindings(program) {
  const bindings = new Map();
  walk(program, (node, parents) => {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
      const kind = parents.at(-1)?.kind;
      const scope = parents.findLast((parent) =>
        kind === 'var' ? isFunction(parent) || parent.type === 'Program' : isScope(parent),
      );
      declare(bindings, scope, node.id.name, {
        kind,
        init: node.init,
        parents: [...parents, node],
      });
    }
    if (node.type === 'FunctionDeclaration' && node.id)
      declare(bindings, parents.findLast(isScope), node.id.name, {
        kind: 'const',
        init: node,
        parents,
      });
    if (isFunction(node))
      for (const param of node.params)
        walk(param, (child) => {
          if (child.type === 'Identifier') declare(bindings, node, child.name, { kind: 'param' });
        });
  });
  return bindings;
}

function callbackBody(callback, parents, bindings) {
  if (callback?.type !== 'Identifier') return callback;
  const binding = lookup(callback.name, parents, bindings);
  return binding?.kind === 'const' && binding.init && isFunction(binding.init)
    ? binding.init
    : callback;
}

function walk(node, enter, parents = []) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, enter, parents);
    return;
  }
  if (typeof node.type === 'string') enter(node, parents);
  const next = typeof node.type === 'string' ? [...parents, node] : parents;
  for (const key of Object.keys(node)) if (!SKIP.has(key)) walk(node[key], enter, next);
}

const functionName = (node, parent) => {
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression')
    if (node.id) return node.id.name;
  if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier')
    return parent.id.name;
  return undefined;
};

const isFunction = (node) =>
  ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type);

function mentions(node, names) {
  let found = false;
  walk(node, (child) => {
    if (child.type === 'Identifier' && names.has(child.name)) found = true;
  });
  return found;
}

function waitsOnWork(node) {
  let found = false;
  walk(node, (child) => {
    if (child.type === 'AwaitExpression') found = true;
    if (child.type === 'UnaryExpression' && child.operator === 'void') found = true;
    if (child.type === 'CallExpression' && ['then', 'fetch'].includes(timerName(child.callee)))
      found = true;
  });
  return found;
}

export function fastPolls(source, path = 'source.ts') {
  const program = parse(source, {
    sourceType: 'module',
    plugins: /\.tsx$/u.test(path) ? ['typescript', 'jsx'] : ['typescript'],
    errorRecovery: true,
  }).program;
  const bindings = collectBindings(program);
  const found = [];
  walk(program, (node, parents) => {
    if (node.type !== 'CallExpression') return;
    const name = timerName(node.callee);
    if (name !== 'setInterval' && name !== 'setTimeout') return;
    const delay = numeric(node.arguments[1], parents, bindings);
    if (delay === undefined || delay >= FAST_MS) return;
    const enclosing = new Set();
    parents.forEach((parent, index) => {
      if (!isFunction(parent)) return;
      const named = functionName(parent, parents[index - 1]);
      if (named !== undefined) enclosing.add(named);
    });
    const callback = node.arguments[0];
    if (
      name === 'setTimeout'
        ? !mentions(callback, enclosing)
        : !waitsOnWork(callbackBody(callback, parents, bindings))
    )
      return;
    found.push({ line: node.loc.start.line, timer: name, delay });
  });
  return found;
}

export function pollsByFile(files) {
  const result = {};
  for (const [path, source] of Object.entries(files)) {
    if (!ROOTS.some((root) => path.startsWith(root))) continue;
    const polls = fastPolls(source, path);
    if (polls.length) result[path] = polls;
  }
  return result;
}

export function checkFastPolls(polls, allowlist) {
  const errors = [];
  for (const [path, found] of Object.entries(polls)) {
    const allowed = allowlist[path];
    if (allowed !== undefined && found.length <= allowed.count) continue;
    const where = found.map((poll) => `${path}:${poll.line} ${poll.timer} ${poll.delay} ms`);
    errors.push(
      `${where.join(', ')}: a repeating timer under ${FAST_MS / 1000} s. If it reads Host state, follow the Host push instead (see ${GUIDE}). If it watches state with no event source (an external service, the OS, an animation), add "${path}": { "count": ${found.length}, "reason": "<why no event fits>" } to ${ALLOWLIST}.`,
    );
  }
  for (const [path, allowed] of Object.entries(allowlist)) {
    if (typeof allowed.reason !== 'string' || allowed.reason.trim().length < 10)
      errors.push(`${ALLOWLIST} entry ${path} needs a reason that says why no event fits.`);
    const now = polls[path]?.length ?? 0;
    if (now < allowed.count)
      errors.push(
        `${ALLOWLIST} allows ${allowed.count} fast timers in ${path}, which now has ${now}. Lower it with \`node scripts/check-fast-polls.mjs --update\`.`,
      );
  }
  return errors;
}

function sources(root) {
  const listed = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...ROOTS],
    { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, shell: false, windowsHide: true },
  );
  if (listed.error) throw listed.error;
  if (listed.status !== 0)
    throw new Error(`git ls-files failed (${listed.status}): ${listed.stderr.trim()}`);
  return Object.fromEntries(
    [...new Set(listed.stdout.split('\0'))]
      .filter((path) => /\.(?:ts|tsx)$/u.test(path) && !/\.d\.ts$|\.test\.tsx?$/u.test(path))
      .flatMap((path) => {
        try {
          return [[path, readFileSync(join(root, path), 'utf8')]];
        } catch (error) {
          if (error?.code === 'ENOENT') return [];
          throw error;
        }
      }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..');
  const polls = pollsByFile(sources(root));
  const allowlist = JSON.parse(readFileSync(join(root, ALLOWLIST), 'utf8'));
  if (process.argv.includes('--update')) {
    const next = Object.fromEntries(
      Object.entries(allowlist)
        .filter(([path]) => polls[path] !== undefined)
        .map(([path, allowed]) => [
          path,
          { ...allowed, count: Math.min(allowed.count, polls[path].length) },
        ]),
    );
    writeFileSync(join(root, ALLOWLIST), `${JSON.stringify(next, null, 2)}\n`);
    console.log(`fast polls: ${Object.keys(next).length} allowed files`);
  } else {
    const errors = checkFastPolls(polls, allowlist);
    for (const error of errors) console.error(`fast polls: ${error}`);
    if (errors.length) process.exitCode = 1;
    else
      console.log(
        `fast polls: no new repeating timer under ${FAST_MS / 1000} s (${Object.keys(allowlist).length} allowed files)`,
      );
  }
}
