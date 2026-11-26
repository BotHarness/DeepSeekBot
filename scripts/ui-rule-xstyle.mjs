import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

const SHORTHAND = new Set(['padding', 'margin']);

function key(property) {
  if (property.type !== 'ObjectProperty' || property.computed) return undefined;
  return property.key.type === 'Identifier' ? property.key.name : property.key.value;
}

function sheets(ast, exportedOnly) {
  const found = new Map();
  for (const statement of ast.program.body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type !== 'VariableDeclaration') continue;
    if (exportedOnly && statement.type !== 'ExportNamedDeclaration') continue;
    for (const { id, init } of declaration.declarations) {
      if (
        id.type === 'Identifier' &&
        init?.type === 'CallExpression' &&
        init.callee.type === 'MemberExpression' &&
        init.callee.object.name === 'stylex' &&
        init.callee.property.name === 'create' &&
        init.arguments[0]?.type === 'ObjectExpression'
      )
        found.set(id.name, init.arguments[0]);
    }
  }
  return found;
}

function importedSheets(ast, file, root, parse) {
  const found = new Map();
  for (const statement of ast.program.body) {
    if (statement.type !== 'ImportDeclaration' || !statement.source.value.startsWith('.')) continue;
    const base = posix.join(posix.dirname(file), statement.source.value).replace(/\.js$/u, '');
    const target = ['.tsx', '.ts']
      .map((extension) => base + extension)
      .find((candidate) => existsSync(join(root, candidate)));
    if (target === undefined) continue;
    let exported;
    for (const specifier of statement.specifiers) {
      if (specifier.type !== 'ImportSpecifier') continue;
      exported ??= sheets(parse(readFileSync(join(root, target), 'utf8'), target), true);
      const sheet = exported.get(specifier.imported.name ?? specifier.imported.value);
      if (sheet !== undefined) found.set(specifier.local.name, sheet);
    }
  }
  return found;
}

function references(expression, found = []) {
  if (!expression) return found;
  if (
    expression.type === 'MemberExpression' &&
    !expression.computed &&
    expression.object.type === 'Identifier'
  )
    found.push([expression.object.name, expression.property.name]);
  else if (expression.type === 'ArrayExpression')
    for (const element of expression.elements) references(element, found);
  else if (expression.type === 'LogicalExpression') references(expression.right, found);
  else if (expression.type === 'ConditionalExpression') {
    references(expression.consequent, found);
    references(expression.alternate, found);
  }
  return found;
}

export function desktopXstyleShorthand(file, ast, walk, { root, parse }) {
  let available;
  const found = [];
  walk(ast.program, (node) => {
    if (node.type !== 'JSXAttribute' || node.name.name !== 'xstyle') return;
    if (node.value?.type !== 'JSXExpressionContainer') return;
    available ??= new Map([
      ...importedSheets(ast, file, root ?? dirname(file), parse),
      ...sheets(ast, false),
    ]);
    for (const [sheet, name] of references(node.value.expression)) {
      const block = available
        .get(sheet)
        ?.properties.find((property) => key(property) === name)?.value;
      if (block?.type !== 'ObjectExpression') continue;
      for (const property of block.properties) {
        const css = key(property);
        if (SHORTHAND.has(css))
          found.push({
            rule: 'xstyleShorthand',
            file,
            line: property.loc.start.line,
            text: `${sheet}.${name} ${css}`,
          });
      }
    }
  });
  return found;
}
