#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareBaselineCounts } from './baseline-counts.mjs';
import { catalogueExports, desktopComposition, renderCatalogue } from './ui-rule-composition.mjs';
import { desktopControls, fixDesktopIcons } from './ui-rule-controls.mjs';
import { desktopStyles, fixDesktopStyles } from './ui-rule-styles.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');

export const BASELINE = join(root, 'scripts/ui-rules-baseline.json');
const DS = 'packages/client/src/client/ds';
const CATALOGUE = `${DS}/README.md`;
const CATALOGUE_DATA = `${DS}/catalogue.json`;
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
  styleLiteral: {
    help: 'replace the literal with a matching role from ds/tobs.stylex.ts; run pnpm lint:fix for nearby px tokens',
    section: 'G1 rule 1, dsh-ui § Tokens over literals',
  },
  breakpoint: {
    help: 'use the medium or expanded token from ds/tobs.stylex.ts in the media query; pnpm lint:fix can migrate px queries',
    section: 'G1 rule 2, #4282 decision 8',
  },
  motionToken: {
    help: 'use duration and easing roles from ds/tobs.stylex.ts; run pnpm lint:fix for recognized values',
    section: 'G1 rule 6, docs/agents/ui-design.md § Component names and motion',
  },
  reducedMotion: {
    help: 'disable or shorten the motion in a prefers-reduced-motion override on the same style',
    section: 'G1 rule 6, docs/agents/ui-design.md § Component names and motion',
  },
  iconSource: {
    help: 'use ds/Icon with a Lucide glyph name; run pnpm lint:fix for mapped DSH JSX imports',
    section: 'G1 rule 3, docs/agents/ui-design.md § Design rule 2',
  },
  accessibleName: {
    help: 'give the icon-only control a localized aria-label or aria-labelledby reference',
    section: 'G1 rule 4, docs/agents/ui-design.md § Design rules 2 and 6',
  },
  statusLabel: {
    help: 'pair the status with a localized label; use aria-hidden for a decorative duplicate of an existing label',
    section: 'G1 rule 4, docs/agents/ui-design.md § Design rules 2 and 6',
  },
  focusVisible: {
    help: 'apply a StyleX block with a visible :focus-visible ring using the focus token',
    section: 'G1 rule 5, docs/agents/ui-design.md § Design rule 6',
  },
  disabledStyle: {
    help: 'apply a distinct disabled style with :disabled, data-disabled, or aria-disabled',
    section: 'G1 rule 5, docs/agents/ui-design.md § Design rule 6',
  },
  catalogue: {
    help: 'record what each export replaces in ds/catalogue.json, remove retired entries and regenerate ds/README.md with pnpm lint:fix',
    section: 'G1 rule 7, docs/agents/ui-design.md § Design rule 7',
  },
  duplicateComponent: {
    help: 'compose or extend the matching primitive in ds/README.md and give product components a distinct name',
    section: 'G1 rule 7, docs/agents/ui-design.md § Design rule 7',
  },
  settingsRow: {
    help: 'give each SettingsRow one title, one optional short description and one control; move additional controls to another row',
    section: 'G1 rule 11, docs/decisions/desktop-ui.md § Tobs owns Bot mode’s design system',
  },
  primaryAction: {
    help: 'keep one primary Button per dialog, including its built-in submit action; use an outline button for secondary actions',
    section: 'G1 rule 11, docs/decisions/desktop-ui.md § Tobs owns Bot mode’s design system',
  },
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

export function walk(node, visit) {
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

export function jsxCopy(source, file, ast = parseSource(source, file)) {
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

export function pressables(source, file, ast = parseSource(source, file)) {
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

export function parseSource(source, file) {
  return parse(source, {
    sourceType: 'module',
    plugins: file.endsWith('.ts') ? ['typescript'] : ['typescript', 'jsx'],
  });
}

function files(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return files(path);
    const extensions = MOBILE.test(path) ? /\.tsx$/u : /\.(?:ts|tsx)$/u;
    return extensions.test(path) && !entry.name.endsWith('.d.ts') && !SKIP.test(path) ? [path] : [];
  });
}

export function readCatalogueExports() {
  return files(DS).flatMap((file) => {
    const source = readFileSync(join(root, file), 'utf8');
    return catalogueExports(parseSource(source, file), file, walk);
  });
}

function checkCatalogue(components, write) {
  const metadata = JSON.parse(readFileSync(join(root, CATALOGUE_DATA), 'utf8'));
  const { markdown, missing, stale } = renderCatalogue(components, metadata);
  const path = join(root, CATALOGUE);
  const found = [
    ...missing,
    ...stale.map((text) => ({
      rule: 'catalogue',
      file: CATALOGUE_DATA,
      line: 1,
      text: `retired export ${text}`,
    })),
  ];
  if (found.length) return found;
  if (existsSync(path) && readFileSync(path, 'utf8') === markdown) return [];
  if (write) writeFileSync(path, markdown);
  else
    found.push({
      rule: 'catalogue',
      file: CATALOGUE,
      line: 1,
      text: 'generated catalogue is stale',
    });
  return found;
}

export function scan(fix = false) {
  const components = readCatalogueExports();
  const catalogue = checkCatalogue(components, fix);
  if (fix && catalogue.length) return catalogue;
  const catalogueNames = new Set(components.map(({ name }) => name));
  const sourceFindings = SCAN.flatMap(files)
    .sort()
    .flatMap((file) => {
      const path = join(root, file);
      let source = readFileSync(path, 'utf8');
      let ast = parseSource(source, file);
      if (MOBILE.test(file))
        return [...jsxCopy(source, file, ast), ...pressables(source, file, ast)];
      let styles = desktopStyles(source, file, ast, walk);
      if (fix) {
        let next = styles.some(({ edit }) => edit)
          ? fixDesktopStyles(source, file, ast, styles)
          : source;
        if (next !== source) ast = parseSource(next, file);
        if (next.includes('@deepseek-ai/dsh-client-ui')) next = fixDesktopIcons(next, file, ast);
        if (next !== source) {
          ast = parseSource(next, file);
          source = next;
          writeFileSync(path, source);
          styles = desktopStyles(source, file, ast, walk);
        }
      }
      const copy = file.endsWith('.tsx') ? jsxCopy(source, file, ast) : [];
      return [
        ...copy,
        ...styles,
        ...desktopControls(source, file, ast, walk),
        ...desktopComposition(file, ast, walk, catalogueNames),
      ];
    });
  return [...catalogue, ...sourceFindings];
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
          Object.keys(byRule[rule] ?? {})
            .sort()
            .map((file) => [file, byRule[rule][file].sort()]),
        ),
      ]),
  );
}

function countsByRule(inventory) {
  return new Map(
    Object.entries(inventory).map(([rule, files]) => [
      rule,
      new Map(Object.entries(files).map(([file, findings]) => [file, findings.length])),
    ]),
  );
}

function describeFinding({ rule, file, line, text }) {
  return `${file}:${line} "${text}": ${RULES[rule].help} (${RULES[rule].section})`;
}

export function compare(found, baseline) {
  const { grown, shrunk } = compareBaselineCounts(
    countsByRule(findings(found)),
    countsByRule(baseline),
  );
  return {
    problems: grown.map(
      ({ rule, message }) => `${message}; ${RULES[rule].help} (${RULES[rule].section})`,
    ),
    stale: shrunk,
  };
}

export function baselineGrowth(current, previous) {
  const { grown } = compareBaselineCounts(countsByRule(current), countsByRule(previous));
  const missing = Object.keys(previous)
    .filter((rule) => !Object.hasOwn(current, rule))
    .map(
      (rule) => `missing baseline key ${rule}; keep an empty object when the last finding is fixed`,
    );
  return [...grown.map(({ message }) => message), ...missing];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const base = process.argv.find((arg) => arg.startsWith('--base='))?.slice('--base='.length);
  if (base !== undefined) {
    const previous = JSON.parse(
      execFileSync('git', ['show', `${base}:scripts/ui-rules-baseline.json`], {
        cwd: root,
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
      }),
    );
    const grown = baselineGrowth(baseline, previous);
    for (const finding of grown) console.error(`ui rules: baseline grew: ${finding}`);
    if (grown.length) process.exit(1);
    console.log('UI rules baseline totals did not grow.');
    process.exit(0);
  }
  if (process.argv.includes('--write-catalogue')) {
    const found = checkCatalogue(readCatalogueExports(), true);
    for (const line of found.map(describeFinding)) console.error(`ui rules: ${line}`);
    process.exit(found.length ? 1 : 0);
  }
  const fix = process.argv.includes('--fix');
  const found = scan(fix);
  if (fix && !process.argv.includes('--write')) {
    const problems = found.filter(({ rule }) => rule === 'catalogue').map(describeFinding);
    for (const line of problems) console.error(`ui rules: ${line}`);
    if (problems.length) process.exit(1);
    console.log(
      'Applied desktop UI autofixes. Run the checker and use --write to clear fixed baseline entries.',
    );
    process.exit(0);
  }
  const present = findings(found);
  const current = Object.fromEntries(Object.keys(RULES).map((rule) => [rule, present[rule] ?? {}]));
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
      for (const line of stale)
        console.error(
          `ui rules: ${line}; shrink the baseline with node scripts/check-ui-rules.mjs --write`,
        );
    if (problems.length || stale.length) process.exit(1);
  }
  console.log(`UI rules pass (${found.length} baselined findings left).`);
}
