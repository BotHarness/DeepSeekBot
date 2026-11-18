#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');

export const BASELINE = join(root, 'scripts/ui-copy-baseline.json');
export const SOURCES = [
  { name: 'client', file: 'packages/client/src/client/locale.ts' },
  { name: 'mobile', file: 'apps/mobile/src/ui/strings.ts' },
];
const GUIDE = 'docs/agents/ui-copy.md';

const CJK = '\\p{Script=Han}';
const HALF = { ',': '，', ';': '；', ':': '：', '?': '？', '!': '！' };
const OUTSIDE_APP =
  /请(?:在|到|前往|打开|用)[^，。；]*?(?:系统|电脑|浏览器|终端|邮箱|手机|另一台|网页|官网|App Store|Google Play|设备设置)/u;
const PLEASE_FREE = new RegExp(`${OUTSIDE_APP.source}|邀请|申请|请求|请教`, 'gu');
const RISK_KEY = /confirm|warning|risk|danger|consent/iu;
const SENTENCE_END = /[。！？](?=.)/gu;

export const RULES = {
  zhPunctuation: {
    locale: 'zh',
    test: (text) => fixPunctuation(text) !== text,
    fix: (text) => fixPunctuation(text),
    help: 'use full-width punctuation next to Chinese text (，；：？！（）。)',
    section: 'Chinese',
  },
  zhSpacing: {
    locale: 'zh',
    test: (text) => fixSpacing(text) !== text,
    fix: (text) => fixSpacing(text),
    help: 'put one space between Chinese and Latin words',
    section: 'Chinese',
  },
  zhPlease: {
    locale: 'zh',
    test: (text) => text.replace(PLEASE_FREE, '').includes('请'),
    help: 'drop 「请」 unless the reader must go outside the app (system settings, another computer, the browser)',
    section: 'Please and failures',
  },
  enPlease: {
    locale: 'en',
    test: (text) => /\bplease\b/iu.test(text),
    help: 'drop "Please"; say what to do',
    section: 'Please and failures',
  },
  zhLong: {
    locale: 'zh',
    test: (text, id) =>
      (text.match(SENTENCE_END) ?? []).length >= 2 && !RISK_KEY.test(id.split('.').pop()),
    help: 'keep a caption to one short sentence, two at most; move the rest to the docs',
    section: 'Keep it short and plain',
  },
};

function fixPunctuation(text) {
  const after = new RegExp(`(?<=[${CJK.slice(0)}」』）])([,;:?!])(?![\\d/])`, 'gu');
  const open = new RegExp(`\\((?=[^()]*[${CJK}][^()]*\\))`, 'gu');
  const close = new RegExp(`(?<=（[^（）]*)\\)`, 'gu');
  const period = new RegExp(`(?<=[${CJK}」』）])\\.(?=\\s|$)`, 'gu');
  return text
    .replace(after, (mark) => HALF[mark])
    .replace(open, '（')
    .replace(close, '）')
    .replace(period, '。');
}

function fixSpacing(text) {
  return text
    .replace(new RegExp(`([${CJK}])([A-Za-z])`, 'gu'), '$1 $2')
    .replace(new RegExp(`([A-Za-z])([${CJK}])`, 'gu'), '$1 $2');
}

function keyOf(property) {
  const key = property.key;
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'StringLiteral') return key.value;
  return undefined;
}

function walkStrings(node, path, out) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'StringLiteral') {
    out.push({
      path,
      segments: [{ start: node.start + 1, end: node.end - 1, raw: node.extra.raw.slice(1, -1) }],
      text: node.value,
    });
    return;
  }
  if (node.type === 'TemplateLiteral') {
    out.push({
      path,
      segments: node.quasis.map((quasi) => ({
        start: quasi.start,
        end: quasi.end,
        raw: quasi.value.raw,
      })),
      text: node.quasis.map((quasi) => quasi.value.cooked).join('{…}'),
    });
    return;
  }
  if (node.type === 'ObjectExpression') {
    for (const property of node.properties) {
      if (property.type !== 'ObjectProperty' && property.type !== 'ObjectMethod') continue;
      const key = keyOf(property);
      if (key === undefined) continue;
      walkStrings(
        property.type === 'ObjectMethod' ? property.body : property.value,
        `${path}.${key}`,
        out,
      );
    }
    return;
  }
  for (const [field, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments'].includes(field))
      continue;
    if (field === 'test' && node.type === 'ConditionalExpression') continue;
    if (Array.isArray(value)) value.forEach((child) => walkStrings(child, path, out));
    else if (value && typeof value.type === 'string') walkStrings(value, path, out);
  }
}

export function collect(source, name) {
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const strings = [];
  for (const statement of ast.program.body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type !== 'VariableDeclaration') continue;
    for (const declarator of declaration.declarations) {
      const locale = declarator.id.name;
      let init = declarator.init;
      while (init && /^TS(?:As|Satisfies)Expression$/u.test(init.type)) init = init.expression;
      if ((locale !== 'en' && locale !== 'zh') || init?.type !== 'ObjectExpression') continue;
      const found = [];
      walkStrings(init, `${name}:${locale}`, found);
      const seen = new Map();
      for (const entry of found) {
        const count = seen.get(entry.path) ?? 0;
        seen.set(entry.path, count + 1);
        strings.push({ ...entry, locale, id: count ? `${entry.path}#${count}` : entry.path });
      }
    }
  }
  return strings;
}

const visible = (text) => /[\p{L}]/u.test(text) && !/^[\w.-]+$/u.test(text);

export function findings(strings) {
  const result = {};
  for (const [rule, { locale, test }] of Object.entries(RULES)) {
    result[rule] = strings
      .filter(
        (entry) => entry.locale === locale && visible(entry.text) && test(entry.text, entry.id),
      )
      .map((entry) => entry.id)
      .sort();
  }
  return result;
}

export function compare(current, baseline) {
  const problems = [];
  const stale = [];
  for (const [rule, ids] of Object.entries(current)) {
    const allowed = new Set(baseline[rule] ?? []);
    for (const id of ids)
      if (!allowed.has(id))
        problems.push(`${id}: ${RULES[rule].help} (${GUIDE} § ${RULES[rule].section})`);
    const now = new Set(ids);
    for (const id of allowed) if (!now.has(id)) stale.push(`${rule} ${id}`);
  }
  return { problems, stale };
}

export function fixSource(source, strings) {
  const edits = [];
  for (const entry of strings)
    for (const [, rule] of Object.entries(RULES)) {
      if (!rule.fix || rule.locale !== entry.locale) continue;
      for (const segment of entry.segments) {
        const next = rule.fix(segment.raw);
        if (next !== segment.raw) edits.push({ ...segment, next });
      }
    }
  const merged = new Map();
  for (const edit of edits) {
    const current = merged.get(edit.start);
    const base = current ? current.next : edit.raw;
    let next = base;
    for (const rule of Object.values(RULES))
      if (rule.fix && rule.locale === 'zh') next = rule.fix(next);
    merged.set(edit.start, { ...edit, next });
  }
  return [...merged.values()]
    .sort((a, b) => b.start - a.start)
    .reduce((text, edit) => text.slice(0, edit.start) + edit.next + text.slice(edit.end), source);
}

function scanAll() {
  return SOURCES.flatMap(({ name, file }) => collect(readFileSync(join(root, file), 'utf8'), name));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const write = process.argv.includes('--write');
  if (process.argv.includes('--fix')) {
    for (const { name, file } of SOURCES) {
      const path = join(root, file);
      const source = readFileSync(path, 'utf8');
      const next = fixSource(source, collect(source, name));
      if (next !== source) writeFileSync(path, next);
    }
  }
  const current = findings(scanAll());
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const { problems, stale } = compare(current, baseline);
  if (write) {
    if (problems.length && !process.argv.includes('--init')) {
      for (const line of problems) console.error(`ui copy: ${line}`);
      console.error('The baseline only shrinks; fix the new copy instead.');
      process.exit(1);
    }
    writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
  } else {
    for (const line of problems) console.error(`ui copy: ${line}`);
    if (stale.length)
      console.error(
        `ui copy: ${stale.length} baselined finding(s) are fixed; shrink the baseline with node scripts/check-ui-copy.mjs --write`,
      );
    if (problems.length || stale.length) {
      if (problems.length)
        console.error(
          'Mechanical fixes (punctuation, spacing): node scripts/check-ui-copy.mjs --fix',
        );
      process.exit(1);
    }
  }
  const total = Object.values(current).reduce((sum, ids) => sum + ids.length, 0);
  console.log(`UI copy rules pass (${total} baselined findings left).`);
}
