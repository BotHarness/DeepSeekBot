import { parse } from '@babel/parser';
import babelTraverse from '@babel/traverse';

const traverse = babelTraverse.default ?? babelTraverse;
const sourceFile = /^packages\/[^/]+\/src\/.*\.(?:[cm]?[jt]sx?|sql)$/u;
const testFile = /\.(?:d|spec|test)\.[^/]+$|\/(?:__tests__|test|tests)\//u;
const sqlKeyword = /\b(?:INSERT|REPLACE|UPDATE|DELETE|FROM|JOIN)\b/iu;
const catalogByOwners = new WeakMap();
const interpolation = /\u0000(\d+)\u0000/gu;
const gap = String.raw`(?:\s|/\*[\s\S]*?\*/|--[^\r\n]*(?=\r?\n|$))+`;
const writeKeyword = new RegExp(
  String.raw`\b(?:insert(?:${gap}or${gap}\w+)?${gap}into|replace${gap}into|delete${gap}from|update)${gap}`,
  'iu',
);
const identifier = String.raw`(?:"(?:[^"]|"")+"|\x60[^\x60]+\x60|\[[^\]]+\]|'[^']+'|[\w$\u0000]+)`;
const target = String.raw`(?:${identifier}\s*\.\s*)?(${identifier})`;
const operations = new RegExp(
  String.raw`\b(insert(?:${gap}or${gap}\w+)?${gap}into|replace${gap}into|delete${gap}from)${gap}${target}` +
    String.raw`|\b(update)(?:${gap}or${gap}\w+)?${gap}${target}(?=${gap}(?:as${gap}${identifier}${gap})?(?:(?:not${gap}indexed|indexed${gap}by${gap}${identifier})${gap})?set\b)` +
    String.raw`|\b(from|join)${gap}${target}` +
    String.raw`|--[^\r\n]*|/\*[\s\S]*?\*/|"(?:[^"]|"")*"|'(?:[^']|'')*'`,
  'giu',
);

export function isTableOwnerSource(file) {
  return sourceFile.test(file) && !testFile.test(file);
}

export function tableOwnerWriteAnnotation(line) {
  return /^\s*\/\/ table-owner-write:\s+(\w+)\s*$/u.exec(line)?.[1];
}

function literalPaths(path) {
  if (
    path.isTSAsExpression() ||
    path.isTSSatisfiesExpression() ||
    path.isTSTypeAssertion() ||
    path.isParenthesizedExpression()
  )
    return literalPaths(path.get('expression'));
  if (path.isIdentifier()) {
    const binding = path.scope.getBinding(path.node.name);
    if (!binding?.constant) return [];
    const declaration = binding.path;
    if (declaration.isVariableDeclarator() && binding.kind === 'const') {
      const loop = declaration.parentPath.parentPath;
      if (loop.isForOfStatement() && loop.get('left') === declaration.parentPath) {
        const list = loop.get('right');
        return list.isArrayExpression() ? list.get('elements') : [];
      }
      const init = declaration.get('init');
      return init.node && init.node.end <= path.node.start ? literalPaths(init) : [];
    }
    if (binding.kind === 'param') {
      const type = declaration.get('typeAnnotation');
      if (!type.node) return [];
      const annotation = type.get('typeAnnotation');
      const types = annotation.isTSUnionType() ? annotation.get('types') : [annotation];
      if (types.every((part) => part.isTSLiteralType()))
        return types.map((part) => part.get('literal'));
    }
    return [];
  }
  if (path.isMemberExpression()) {
    const objects = literalPaths(path.get('object'));
    const property = path.get('property');
    const name = path.node.computed ? property.node.value : property.node.name;
    if (!objects.every((object) => object.isObjectExpression())) return [];
    return objects.flatMap((object) => {
      const fields = object.get('properties');
      if (!fields.every((field) => field.isObjectProperty() && !field.node.computed)) return [];
      return fields
        .filter(
          (field) => name === undefined || (field.node.key.name ?? field.node.key.value) === name,
        )
        .map((field) => field.get('value'));
    });
  }
  return [path];
}

function resolveTarget(targetName, expressions) {
  let names = [''];
  let end = 0;
  for (const match of targetName.matchAll(interpolation)) {
    const values = literalPaths(expressions[Number(match[1])]);
    if (!values.length || !values.every((path) => path.isStringLiteral())) return [];
    const prefix = targetName.slice(end, match.index);
    names = names.flatMap((name) => values.map((path) => name + prefix + path.node.value));
    end = match.index + match[0].length;
  }
  return names.map((name) =>
    (name + targetName.slice(end)).replace(/^["`\[']|["`\]']$/gu, '').toLowerCase(),
  );
}

export function scanTableSql(file, source, owners) {
  const writes = new Map();
  const reads = new Set();
  const errors = [];
  if (!catalogByOwners.has(owners)) {
    const names = Object.keys(owners).map((name) => name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
    catalogByOwners.set(owners, {
      tables: new Map(Object.keys(owners).map((name) => [name.toLowerCase(), name])),
      readCandidate: new RegExp(
        String.raw`\b(?:from|join)${gap}(?:${identifier}\s*\.\s*)?(?:["'\[\x60]?(?:${names.join('|')})\b|\$\{)`,
        'iu',
      ),
    });
  }
  const { tables: tableNames, readCandidate } = catalogByOwners.get(owners);
  if (!writeKeyword.test(source) && !readCandidate.test(source)) return { writes, reads, errors };

  const lines = source.split(/\r?\n/u);
  function scan(start, sql, expressions) {
    for (const match of sql.matchAll(operations)) {
      const operation = match[1] ?? match[3] ?? match[5];
      if (!operation) continue;
      const isWrite = match[5] === undefined;
      const targetName = match[2] ?? match[4] ?? match[6];
      let tables = resolveTarget(targetName, expressions);
      const before = sql.slice(0, match.index);
      const line = start + (before.match(/\n/gu)?.length ?? 0);
      if (isWrite && tables.length === 0) {
        const annotation = (before.trim() ? [line] : [line, start])
          .map((at) => tableOwnerWriteAnnotation(lines[at - 2] ?? ''))
          .find(Boolean);
        if (annotation && tableNames.has(annotation.toLowerCase()))
          tables = [annotation.toLowerCase()];
        else
          errors.push(
            `${file}:${line}: unresolved SQL write target; add // table-owner-write: <table> on the preceding line`,
          );
      }
      for (const name of tables) {
        const table = tableNames.get(name);
        if (table === undefined) continue;
        if (isWrite) writes.set(table, line);
        else reads.add(table);
      }
    }
  }
  function sqlText(path, expressions) {
    if (path.isStringLiteral()) return path.node.value;
    if (path.isTemplateLiteral()) {
      const values = path.get('expressions');
      return path.node.quasis
        .map(
          (part, i) => part.value.cooked + (values[i] ? placeholder(values[i], expressions) : ''),
        )
        .join('');
    }
    if (path.isBinaryExpression({ operator: '+' }))
      return sqlText(path.get('left'), expressions) + sqlText(path.get('right'), expressions);
    return placeholder(path, expressions);
  }
  function placeholder(path, expressions) {
    return `\u0000${expressions.push(path) - 1}\u0000`;
  }
  function visit(path) {
    if (path.parentPath.isBinaryExpression({ operator: '+' })) return;
    const expressions = [];
    const sql = sqlText(path, expressions);
    if (sqlKeyword.test(sql)) scan(path.node.loc.start.line, sql, expressions);
  }
  if (file.endsWith('.sql')) scan(1, source, []);
  else {
    const ast = parse(source, {
      sourceType: 'unambiguous',
      plugins: [
        /\.[jt]sx?$/u.test(file) && !file.endsWith('.ts') ? 'jsx' : null,
        'typescript',
      ].filter(Boolean),
    });
    traverse(ast, {
      StringLiteral: visit,
      TemplateLiteral: visit,
      BinaryExpression(path) {
        if (path.node.operator === '+') visit(path);
      },
    });
  }
  return { writes, reads, errors };
}
