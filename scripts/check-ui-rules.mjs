#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');

export const BASELINE = join(root, 'scripts/ui-rules-baseline.json');
const SCAN = ['packages/client/src'];
const SKIP = /(?:\.test|\.spec|\.stories)\.tsx$|\/test\/|\/__tests__\//u;
const COPY_PROPS = new Set([
  'title',
  'aria-label',
  'aria-description',
  'placeholder',
  'alt',
  'label',
  'description',
]);
const CJK = /\p{Script=Han}/u;
const WORD = /\p{L}{2,}/u;
const FILE_NAME = /^[\w-]+\.[a-z]{1,5}$/iu;

export const RULES = {
  jsxCopy: {
    help: 'move visible text into locale.ts and read it with t()',
    section: 'docs/agents/ui-copy.md § Where copy lives',
  },
};

export function isCopy(text) {
  const trimmed = text.replace(/\s+/gu, ' ').trim();
  if (FILE_NAME.test(trimmed)) return false;
  const words = trimmed
    .replaceAll('{…}', ' ')
    .split(/\s+/u)
    .filter((part) => /\p{L}/u.test(part));
  return CJK.test(trimmed) || (words.length >= 2 && words.some((word) => WORD.test(word)));
}

function literalTexts(node) {
  if (!node) return [];
  if (node.type === 'StringLiteral') return [node.value];
  if (node.type === 'JSXExpressionContainer') return literalTexts(node.expression);
  if (node.type === 'TemplateLiteral')
    return [node.quasis.map((quasi) => quasi.value.cooked ?? '').join('{…}')];
  if (node.type === 'ConditionalExpression')
    return [...literalTexts(node.consequent), ...literalTexts(node.alternate)];
  if (node.type === 'LogicalExpression')
    return node.operator === '&&'
      ? literalTexts(node.right)
      : [...literalTexts(node.left), ...literalTexts(node.right)];
  return [];
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (Array.isArray(value)) for (const child of value) walk(child, visit);
    else if (value && typeof value === 'object' && typeof value.type === 'string')
      walk(value, visit);
  }
}

export function jsxCopy(source, file) {
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const found = [];
  const add = (text, line) => {
    if (isCopy(text)) found.push({ file, line, text: text.replace(/\s+/gu, ' ').trim() });
  };
  const addAll = (node, line) => {
    for (const text of literalTexts(node)) add(text, line);
  };
  walk(ast.program, (node) => {
    if (node.type === 'JSXText') add(node.value, node.loc.start.line);
    else if (node.type === 'JSXAttribute') {
      const name = node.name.type === 'JSXIdentifier' ? node.name.name : undefined;
      if (name && COPY_PROPS.has(name)) addAll(node.value, node.loc.start.line);
    } else if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      for (const child of node.children)
        if (child.type === 'JSXExpressionContainer') addAll(child.expression, child.loc.start.line);
    }
  });
  return found.sort((a, b) => a.line - b.line);
}

function files(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return files(path);
    return entry.name.endsWith('.tsx') && !SKIP.test(path) ? [path] : [];
  });
}

export function scan() {
  return SCAN.flatMap(files)
    .sort()
    .flatMap((file) => jsxCopy(readFileSync(join(root, file), 'utf8'), file));
}

export function findings(found) {
  const byFile = {};
  for (const { file, text } of found) (byFile[file] ??= []).push(text);
  return Object.fromEntries(
    Object.keys(byFile)
      .sort()
      .map((file) => [file, byFile[file].sort()]),
  );
}

function counts(list) {
  const map = new Map();
  for (const text of list) map.set(text, (map.get(text) ?? 0) + 1);
  return map;
}

export function compare(found, baseline) {
  const allowed = new Map(
    Object.entries(baseline.jsxCopy ?? {}).map(([file, list]) => [file, counts(list)]),
  );
  const problems = [];
  const seen = new Map();
  for (const { file, line, text } of found) {
    const left = allowed.get(file)?.get(text) ?? 0;
    const key = `${file}\u0000${text}`;
    const used = seen.get(key) ?? 0;
    seen.set(key, used + 1);
    if (used >= left)
      problems.push(`${file}:${line} "${text}": ${RULES.jsxCopy.help} (${RULES.jsxCopy.section})`);
  }
  const stale = [];
  for (const [file, map] of allowed)
    for (const [text, count] of map) {
      const used = seen.get(`${file}\u0000${text}`) ?? 0;
      if (used < count) stale.push(`${file} "${text}"`);
    }
  return { problems, stale };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const found = scan();
  const current = { jsxCopy: findings(found) };
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const { problems, stale } = compare(found, baseline);
  const write = process.argv.includes('--write');
  if (write) {
    if (problems.length) {
      for (const line of problems) console.error(`ui rules: ${line}`);
      console.error('The baseline only shrinks; fix the new findings instead.');
      process.exit(1);
    }
    writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
  } else {
    for (const line of problems) console.error(`ui rules: ${line}`);
    if (stale.length)
      console.error(
        `ui rules: ${stale.length} baselined finding(s) are fixed; shrink the baseline with node scripts/check-ui-rules.mjs --write`,
      );
    if (problems.length || stale.length) process.exit(1);
  }
  console.log(`UI rules pass (${found.length} baselined findings left).`);
}
