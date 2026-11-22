import { attribute, dsImports, jsxName, jsxValue } from './ui-rule-controls.mjs';

const DS = 'packages/client/src/client/ds';
const COMPONENT = /^[A-Z][\w]*$/u;
const PRIMITIVE_SUFFIX =
  /(?:Button|Row|Select|Dialog|Field|Input|Checkbox|Switch|Slider|Tooltip|Popover|Menu)$/u;
const SURFACES = new Set([
  'Dialog',
  'FormDialog',
  'ConfirmDialog',
  'PanelDialog',
  'Modal',
  'SettingsDialog',
]);
const ACTION_SLOTS = new Set([
  'actions',
  'footer',
  'primaryAction',
  'secondaryAction',
  'secondary',
]);
const CONTROLS =
  /(?:Button|Select|Input|Field|Checkbox|Switch|Slider|SegmentedControl|PickerTrigger)$/u;
const BLOCK_TEXT = new Set(['p', 'div', 'li', 'ul', 'ol']);

function componentBody(declaration) {
  if (
    declaration?.type === 'FunctionDeclaration' ||
    declaration?.type === 'FunctionExpression' ||
    declaration?.type === 'ArrowFunctionExpression'
  )
    return declaration.body;
  if (declaration?.type === 'CallExpression') {
    const callee = declaration.callee;
    if (['memo', 'forwardRef'].includes(callee.name ?? callee.property?.name))
      return componentBody(declaration.arguments[0]);
  }
  return undefined;
}

function definitions(node) {
  if (node.type === 'VariableDeclaration')
    return node.declarations
      .filter(({ id }) => id.type === 'Identifier' && COMPONENT.test(id.name))
      .map(({ id, init }) => ({ name: id.name, node: id, body: componentBody(init) }))
      .filter(({ body }) => body);
  if (node.type === 'FunctionDeclaration' && COMPONENT.test(node.id?.name ?? ''))
    return [{ name: node.id.name, node: node.id, body: node.body }];
  return [];
}

function rendered(body, walk) {
  const names = new Set();
  let jsx = false;
  walk(body, (node) => {
    if (node.type === 'JSXFragment') jsx = true;
    if (node.type === 'JSXOpeningElement') {
      jsx = true;
      names.add(jsxName(node.name));
      const role = jsxValue(attribute(node, 'role'))?.value;
      if (typeof role === 'string') names.add(role);
    }
    if (
      node.type === 'CallExpression' &&
      (node.callee.name ?? node.callee.property?.name) === 'createElement'
    )
      jsx = true;
  });
  return { names, jsx };
}

export function catalogueExports(ast, file, walk) {
  if (!file.startsWith(`${DS}/`)) return [];
  const components = new Set();
  const local = new Map();
  for (const statement of ast.program.body) {
    for (const { name, body } of definitions(statement.declaration ?? statement)) {
      if (!rendered(body, walk).jsx) continue;
      local.set(name, body);
      if (
        statement.type === 'ExportNamedDeclaration' ||
        statement.type === 'ExportDefaultDeclaration'
      )
        components.add(name);
    }
  }
  for (const statement of ast.program.body) {
    if (statement.type !== 'ExportNamedDeclaration' || statement.exportKind === 'type') continue;
    for (const specifier of statement.specifiers)
      if (
        specifier.type === 'ExportSpecifier' &&
        specifier.exportKind !== 'type' &&
        COMPONENT.test(specifier.exported.name ?? '') &&
        (statement.source || local.has(specifier.local.name))
      )
        components.add(specifier.exported.name);
  }
  return [...components].map((name) => ({ name, module: file.slice(DS.length + 1), file }));
}

export function renderCatalogue(components, metadata) {
  const expected = new Set();
  const missing = [];
  const rows = [];
  for (const { name, module, file } of components.toSorted(
    (a, b) => a.name.localeCompare(b.name, 'en') || a.module.localeCompare(b.module, 'en'),
  )) {
    const id = `${module}#${name}`;
    expected.add(id);
    const replacement = metadata[id];
    if (typeof replacement !== 'string' || !replacement.trim() || /\r|\n/u.test(replacement))
      missing.push({ rule: 'catalogue', file, line: 1, text: id });
    else rows.push(`- [${name}](${module}) replaces ${replacement}`);
  }
  const stale = Object.keys(metadata).filter((key) => !expected.has(key));
  return {
    missing,
    stale,
    markdown: [
      '# Desktop/Web component catalogue',
      '',
      'Generated from exported components and [catalogue.json](catalogue.json) by `pnpm lint:fix`.',
      '',
      ...rows,
      '',
    ].join('\n'),
  };
}

function count(node, inspect) {
  if (!node) return 0;
  if (node.type === 'JSXExpressionContainer') return count(node.expression, inspect);
  if (node.type === 'JSXFragment') return sum(node.children, inspect);
  if (node.type === 'ConditionalExpression')
    return Math.max(count(node.consequent, inspect), count(node.alternate, inspect));
  if (node.type === 'LogicalExpression')
    return Math.max(
      node.operator === '&&' ? 0 : count(node.left, inspect),
      count(node.right, inspect),
    );
  if (node.type === 'ArrayExpression') return sum(node.elements, inspect);
  if (node.type !== 'JSXElement') return 0;
  return inspect(node);
}

function sum(nodes, inspect) {
  return nodes.reduce((total, node) => total + count(node, inspect), 0);
}

function descriptionLines(value) {
  if (!value) return 0;
  if (value.type === 'StringLiteral' || value.type === 'TemplateLiteral') {
    const text = value.value ?? value.quasis.map((part) => part.value.cooked).join('…');
    return text
      .trim()
      .split(/\r?\n/u)
      .filter((line) => line.trim()).length;
  }
  const breaks = (element) => {
    const tag = jsxName(element.openingElement.name);
    if (tag === 'br') return 2;
    return Math.max(BLOCK_TEXT.has(tag) ? 1 : 0, sum(element.children, breaks));
  };
  return count(value, breaks);
}

function isPrimary(node) {
  if (node?.type === 'ConditionalExpression')
    return isPrimary(node.consequent) || isPrimary(node.alternate);
  return node?.value === 'primary';
}

export function desktopComposition(file, ast, walk, catalogueNames) {
  const imports = dsImports(ast, file);
  const found = [];
  const add = (rule, text, node) => found.push({ rule, file, line: node.loc.start.line, text });
  const nameOf = (opening) => {
    const local = jsxName(opening.name);
    return imports.get(local) ?? local;
  };
  const surface = (opening) =>
    SURFACES.has(nameOf(opening)) ||
    ['dialog', 'alertdialog'].includes(jsxValue(attribute(opening, 'role'))?.value);
  const controls = (element) => {
    const { openingElement, children } = element;
    const name = nameOf(openingElement);
    if (CONTROLS.test(name ?? '') || ['button', 'select', 'input', 'textarea'].includes(name))
      return 1;
    if (surface(openingElement)) return 0;
    return sum(children, controls);
  };
  const primary = (element) => {
    const { openingElement, children } = element;
    if (surface(openingElement)) return 0;
    if (
      nameOf(openingElement) === 'Button' &&
      isPrimary(jsxValue(attribute(openingElement, 'variant')))
    )
      return 1;
    return sum(children, primary);
  };
  walk(ast.program, (node) => {
    if (node.type === 'JSXElement') {
      const opening = node.openingElement;
      if (nameOf(opening) === 'SettingsRow') {
        if (
          !attribute(opening, 'title') &&
          !opening.attributes.some(({ type }) => type === 'JSXSpreadAttribute')
        )
          add('settingsRow', 'missing title', opening);
        for (const prop of ['title', 'description', 'control'])
          if (
            opening.attributes.filter(
              (attr) => attr.type === 'JSXAttribute' && attr.name.name === prop,
            ).length > 1
          )
            add('settingsRow', `duplicate ${prop}`, opening);
        if (descriptionLines(jsxValue(attribute(opening, 'description'))) > 1)
          add('settingsRow', 'multiple description lines', opening);
        if (
          count(jsxValue(attribute(opening, 'control')), controls) +
            count(jsxValue(attribute(opening, 'children')), controls) +
            sum(node.children, controls) >
          1
        )
          add('settingsRow', 'multiple controls', opening);
      }
      if (surface(opening)) {
        const actions = opening.attributes
          .filter((attr) => attr.type === 'JSXAttribute' && ACTION_SLOTS.has(attr.name.name))
          .map(jsxValue);
        const name = nameOf(opening);
        const submit = jsxValue(attribute(opening, 'onSubmit'));
        const hasSubmit =
          name === 'FormDialog' &&
          submit &&
          submit.type !== 'NullLiteral' &&
          !(submit.type === 'Identifier' && submit.name === 'undefined');
        const builtIn = name === 'ConfirmDialog' || hasSubmit ? 1 : 0;
        if (builtIn + sum([...node.children, ...actions], primary) > 1)
          add('primaryAction', name, opening);
      }
    }
    if (file.startsWith(`${DS}/`)) return;
    for (const definition of definitions(node)) {
      const { name, body } = definition;
      if (!catalogueNames.has(name) && !PRIMITIVE_SUFFIX.test(name)) continue;
      const { names, jsx } = rendered(body, walk);
      if (!jsx) continue;
      const suffix = PRIMITIVE_SUFFIX.exec(name)?.[0];
      const composesPrimitive = [...names].some((tag) => {
        const primitive = imports.get(tag);
        return (
          suffix &&
          primitive &&
          catalogueNames.has(primitive) &&
          (primitive.endsWith(suffix) || (suffix === 'Row' && primitive === 'NavItem'))
        );
      });
      const rawControl = [...names].some((tag) =>
        ['button', 'select', 'input', 'textarea', 'dialog'].includes(tag),
      );
      const rawRow =
        /Row$/u.test(name) && [...names].some((tag) => ['li', 'tr', 'div'].includes(tag));
      if (catalogueNames.has(name) || (!composesPrimitive && (rawControl || rawRow)))
        add('duplicateComponent', name, definition.node);
    }
  });
  return found;
}
