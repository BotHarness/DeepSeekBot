import { parse } from '@babel/parser';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Node = { type: string; [key: string]: unknown };

export interface ScannedRow {
  readonly kind: 'row' | 'heading';
  readonly keys: readonly string[];
  readonly descriptions: readonly string[];
  readonly at: string;
}

export interface RegisteredSection {
  readonly id: string;
  readonly component: string;
  readonly entry: string;
}

const PACKAGES = resolve(import.meta.dirname, '../..');
const ROW_TAGS = new Set(['SettingsRow', 'SettingsSection']);
const files = new Map<string, Node>();

export const SECTION_ENTRIES = [
  resolve(PACKAGES, 'client/src/client/index.ts'),
  resolve(PACKAGES, 'browser/src/client/settings.tsx'),
  resolve(PACKAGES, 'computer/src/client/index.tsx'),
];

function ast(file: string): Node {
  let program = files.get(file);
  if (!program) {
    program = parse(readFileSync(file, 'utf8'), {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    }).program as unknown as Node;
    files.set(file, program);
  }
  return program;
}

function children(node: Node): Node[] {
  const out: Node[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key.endsWith('Comments')) continue;
    if (Array.isArray(value)) {
      for (const item of value)
        if (item && typeof item === 'object' && 'type' in item) out.push(item);
    } else if (value && typeof value === 'object' && 'type' in value) out.push(value as Node);
  }
  return out;
}

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  for (const child of children(node)) walk(child, visit);
}

function resolveSource(from: string, source: string): string | undefined {
  if (!source.startsWith('.')) return undefined;
  const base = resolve(dirname(from), source).replace(/\.js$/u, '');
  return ['.tsx', '.ts'].map((ext) => base + ext).find((file) => existsSync(file));
}

function declaration(file: string, name: string): Node | undefined {
  let found: Node | undefined;
  walk(ast(file), (node) => {
    if (found) return;
    if (node.type === 'FunctionDeclaration' && (node.id as Node | null)?.name === name)
      found = node;
    if (
      node.type === 'VariableDeclarator' &&
      (node.id as Node).name === name &&
      node.init &&
      ['ArrowFunctionExpression', 'FunctionExpression', 'CallExpression'].includes(
        (node.init as Node).type,
      )
    )
      found = node.init as Node;
  });
  return found;
}

function locate(file: string, name: string): { file: string; node: Node } | undefined {
  const own = declaration(file, name);
  if (own) return { file, node: own };
  for (const statement of (ast(file).body as Node[]) ?? []) {
    if (statement.type !== 'ImportDeclaration') continue;
    for (const specifier of statement.specifiers as Node[]) {
      if ((specifier.local as Node).name !== name) continue;
      const target = resolveSource(file, (statement.source as Node).value as string);
      if (!target) return undefined;
      const imported =
        specifier.type === 'ImportSpecifier' ? ((specifier.imported as Node).name as string) : name;
      return locate(target, imported);
    }
  }
  return undefined;
}

function translated(expression: Node): string[] {
  if (expression.type === 'ConditionalExpression')
    return [
      ...translated(expression.consequent as Node),
      ...translated(expression.alternate as Node),
    ];
  if (expression.type === 'LogicalExpression') return translated(expression.right as Node);
  if (expression.type === 'StringLiteral') return [expression.value as string];
  if (expression.type !== 'CallExpression') return [];
  const callee = expression.callee as Node;
  const named =
    (callee.type === 'Identifier' && callee.name === 't') ||
    (callee.type === 'MemberExpression' && (callee.property as Node).name === 't');
  const first = (expression.arguments as Node[])[0];
  if (!named || !first) return [];
  if (first.type === 'StringLiteral') return [first.value as string];
  if (first.type === 'ConditionalExpression') return translated(first);
  return [];
}

function attribute(element: Node, name: string): Node | undefined {
  const value = (element.attributes as Node[]).find(
    (candidate) => candidate.type === 'JSXAttribute' && (candidate.name as Node).name === name,
  )?.value as Node | undefined;
  return value?.type === 'JSXExpressionContainer' ? (value.expression as Node) : value;
}

function keysOf(element: Node, name: string): string[] {
  const value = attribute(element, name);
  if (!value) return [];
  return value.type === 'StringLiteral' ? [] : translated(value);
}

function forwardsTitle(node: Node): boolean {
  let forwards = false;
  walk(node, (inner) => {
    if (forwards || inner.type !== 'JSXOpeningElement') return;
    const tag = inner.name as Node;
    if (tag.type !== 'JSXIdentifier' || !ROW_TAGS.has(tag.name as string)) return;
    const title = attribute(inner, 'title');
    forwards =
      (title?.type === 'Identifier' && title.name === 'title') ||
      (title?.type === 'MemberExpression' && (title.property as Node).name === 'title');
  });
  return forwards;
}

export function scanSettingsRows(file: string, component: string): ScannedRow[] {
  const rows: ScannedRow[] = [];
  const seen = new Set<string>();
  const visit = (at: { file: string; node: Node }, id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    walk(at.node, (node) => {
      if (node.type !== 'JSXOpeningElement') return;
      const tag = node.name as Node;
      if (tag.type !== 'JSXIdentifier' || !/^[A-Z]/u.test(tag.name as string)) return;
      const name = tag.name as string;
      const where = `${at.file.slice(PACKAGES.length + 1)}:${(node.loc as { start: { line: number } }).start.line}`;
      if (ROW_TAGS.has(name)) {
        const keys = keysOf(node, 'title');
        if (name === 'SettingsSection' && keys.length === 0) return;
        rows.push({
          kind: name === 'SettingsRow' ? 'row' : 'heading',
          keys,
          descriptions: keysOf(node, 'description'),
          at: where,
        });
        return;
      }
      const next = locate(at.file, name);
      if (!next || !next.file.startsWith(PACKAGES)) return;
      const forwarded = keysOf(node, 'title');
      if (forwarded.length && forwardsTitle(next.node))
        rows.push({
          kind: 'row',
          keys: forwarded,
          descriptions: keysOf(node, 'description'),
          at: where,
        });
      visit(next, `${next.file}#${name}`);
    });
  };
  const root = locate(file, component);
  if (root) visit(root, `${root.file}#${component}`);
  return rows;
}

export function registeredSections(): RegisteredSection[] {
  const sectionIds = Object.fromEntries(
    [
      ...readFileSync(resolve(PACKAGES, 'client/src/client/bot-settings.tsx'), 'utf8').matchAll(
        /^ {2}(\w+): '([\w-]+)',$/gmu,
      ),
    ].map((match) => [match[1], match[2]]),
  );
  const out: RegisteredSection[] = [];
  for (const entry of SECTION_ENTRIES)
    walk(ast(entry), (node) => {
      if (node.type !== 'CallExpression') return;
      const callee = node.callee as Node;
      if (callee.type !== 'MemberExpression' || (callee.property as Node).name !== 'register')
        return;
      const [options, component] = node.arguments as Node[];
      if (options?.type !== 'ObjectExpression' || component?.type !== 'Identifier') return;
      const prop = (key: string) =>
        (options.properties as Node[]).find(
          (candidate) =>
            candidate.type === 'ObjectProperty' && (candidate.key as Node).name === key,
        )?.value as Node | undefined;
      if ((prop('name') as Node | undefined)?.value !== 'botharness.settings.section') return;
      const id = prop('id');
      const value =
        id?.type === 'StringLiteral'
          ? (id.value as string)
          : id?.type === 'MemberExpression'
            ? sectionIds[(id.property as Node).name as string]
            : undefined;
      if (value) out.push({ id: value, component: component.name as string, entry });
    });
  return out;
}
