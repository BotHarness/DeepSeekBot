#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');

export const BASELINE = join(root, 'scripts/ui-rules-baseline.json');
const SCAN = ['packages/client/src', 'apps/mobile/app', 'apps/mobile/src/ui'];
const MOBILE = /^apps\/mobile\//u;
const PRESSABLE = /^(?:Pressable|Touchable\w*)$/u;
const TOUCH_TOKEN = /\btheme\.touch\b|\btouch\[/u;
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
    help: 'move visible text into locale.ts (Web) or strings.ts (mobile)',
    section: 'docs/agents/ui-copy.md § Where copy lives',
  },
  pressableLabel: {
    help: 'give the pressable an accessibilityLabel from strings.ts',
    section: 'apps/mobile/DESIGN.md § Code rules 4',
  },
  touchTarget: {
    help: 'size the pressable to theme.touch (44pt iOS, 48dp Android) or add hitSlop',
    section: 'apps/mobile/DESIGN.md § Code rules 4',
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
    if (isCopy(text))
      found.push({ rule: 'jsxCopy', file, line, text: text.replace(/\s+/gu, ' ').trim() });
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

export function pressables(source, file) {
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const sized = TOUCH_TOKEN.test(source);
  const found = [];
  walk(ast.program, (node) => {
    if (node.type !== 'JSXOpeningElement' || node.name.type !== 'JSXIdentifier') return;
    if (!PRESSABLE.test(node.name.name)) return;
    const names = new Set(
      node.attributes.map((attribute) =>
        attribute.type === 'JSXAttribute' ? attribute.name.name : '...',
      ),
    );
    const line = node.loc.start.line;
    const text = node.name.name;
    if (!names.has('...') && !names.has('accessibilityLabel'))
      found.push({ rule: 'pressableLabel', file, line, text });
    if (!sized && !names.has('...') && !names.has('hitSlop'))
      found.push({ rule: 'touchTarget', file, line, text });
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
    .flatMap((file) => {
      const source = readFileSync(join(root, file), 'utf8');
      return [...jsxCopy(source, file), ...(MOBILE.test(file) ? pressables(source, file) : [])];
    });
}

export function findings(found) {
  const byRule = {};
  for (const { rule, file, text } of found) ((byRule[rule] ??= {})[file] ??= []).push(text);
  return Object.fromEntries(
    Object.keys(RULES)
      .filter((rule) => byRule[rule])
      .map((rule) => [
        rule,
        Object.fromEntries(
          Object.keys(byRule[rule])
            .sort()
            .map((file) => [file, byRule[rule][file].sort()]),
        ),
      ]),
  );
}

function counts(list) {
  const map = new Map();
  for (const text of list) map.set(text, (map.get(text) ?? 0) + 1);
  return map;
}

export function compare(found, baseline) {
  const allowed = new Map();
  for (const [rule, byFile] of Object.entries(baseline))
    for (const [file, list] of Object.entries(byFile))
      for (const [text, count] of counts(list))
        allowed.set(`${rule}\u0000${file}\u0000${text}`, count);
  const problems = [];
  const seen = new Map();
  for (const { rule, file, line, text } of found) {
    const key = `${rule}\u0000${file}\u0000${text}`;
    const used = seen.get(key) ?? 0;
    seen.set(key, used + 1);
    if (used >= (allowed.get(key) ?? 0))
      problems.push(`${file}:${line} "${text}": ${RULES[rule].help} (${RULES[rule].section})`);
  }
  const stale = [];
  for (const [key, count] of allowed)
    if ((seen.get(key) ?? 0) < count) {
      const [rule, file, text] = key.split('\u0000');
      stale.push(`${rule} ${file} "${text}"`);
    }
  return { problems, stale };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const found = scan();
  const current = findings(found);
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
