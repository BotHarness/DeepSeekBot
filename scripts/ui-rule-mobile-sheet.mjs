import babelTraverse from '@babel/traverse';

const traverse = babelTraverse.default ?? babelTraverse;

const SHEETS = new Set([
  'Sheet',
  'SheetFrame',
  'SheetScreen',
  'SheetStack',
  'BottomSheet',
  'ModalBottomSheet',
]);
const PAGE_SHEET = new Set(['pageSheet', 'formSheet']);
const PRIMITIVES =
  /\/(?:primitives\/(?:sheet-[\w-]+|drawer-header)|chat\/sheet(?:-frame)?)(?:\.\w+)?\.tsx$/u;
const PAGE_FILL =
  /^theme\.(?:color\.(?:base|surface|sheet|well|field)|layer\.(?:canvas|sheet|well|field)\.fill|layer\.canvas\.\w+)$/u;
const PAGE_LAYERS = new Set(['canvas', 'well', 'field']);
const SURFACE_PROPS = new Set(['containerColor', 'backgroundColor']);

function nameOf(element) {
  const name = element.get('openingElement.name');
  if (name.isJSXIdentifier()) return name.node.name;
  if (name.isJSXMemberExpression()) return name.node.property.name;
  return undefined;
}

function attribute(element, name) {
  return element
    .get('openingElement.attributes')
    .find((attr) => attr.isJSXAttribute() && attr.node.name.name === name);
}

function literal(attr) {
  const value = attr?.get('value');
  if (value?.isStringLiteral()) return value.node.value;
  const inner = value?.isJSXExpressionContainer() ? value.get('expression') : undefined;
  return inner?.isStringLiteral() ? inner.node.value : undefined;
}

function isSheet(element) {
  const name = nameOf(element);
  if (name === undefined) return false;
  if (SHEETS.has(name)) return true;
  return name === 'Modal' && PAGE_SHEET.has(literal(attribute(element, 'presentationStyle')));
}

function chain(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed) {
    const object = chain(node.object);
    return object === undefined ? undefined : `${object}.${node.property.name}`;
  }
  return undefined;
}

function pageFills(path) {
  if (path.isConditionalExpression())
    return [...pageFills(path.get('consequent')), ...pageFills(path.get('alternate'))];
  if (path.isLogicalExpression())
    return [...pageFills(path.get('left')), ...pageFills(path.get('right'))];
  if (path.isStringLiteral())
    return path.node.value === 'transparent' || path.node.value === 'clear'
      ? []
      : [JSON.stringify(path.node.value)];
  const text = chain(path.node);
  return text !== undefined && PAGE_FILL.test(text) ? [text] : [];
}

function scopeOf(element) {
  const fn = element.getFunctionParent();
  if (fn === null) return element;
  const root = element.findParent((parent) => parent.isReturnStatement() || parent === fn);
  const returned =
    (root?.isReturnStatement() && root.node.argument === element.node) ||
    (fn.isArrowFunctionExpression() && fn.node.body === element.node);
  return returned ? fn : element;
}

export function mobileSheetSurface(file, ast) {
  if (PRIMITIVES.test(file)) return [];
  const components = new Map();
  traverse(ast, {
    'FunctionDeclaration|VariableDeclarator'(path) {
      const id = path.node.id;
      if (id?.type !== 'Identifier' || !/^[A-Z]/u.test(id.name)) return;
      const fn = path.isFunctionDeclaration() ? path : path.get('init');
      if (fn.isFunction()) components.set(id.name, fn);
    },
  });
  const owner = new Map([...components].map(([name, fn]) => [fn.node, name]));
  const wrappers = new Set();
  let scopes = [];
  for (let size = -1; size !== wrappers.size;) {
    size = wrappers.size;
    scopes = [];
    traverse(ast, {
      JSXElement(element) {
        if (!isSheet(element) && !wrappers.has(nameOf(element))) return;
        const scope = scopeOf(element);
        scopes.push(scope);
        const name = owner.get(scope.node);
        if (name !== undefined) wrappers.add(name);
      },
    });
  }
  const included = new Set(scopes.map((scope) => scope.node));
  for (let index = 0; index < scopes.length; index++)
    scopes[index].traverse({
      JSXOpeningElement(opening) {
        const name = opening.get('name');
        const fn = name.isJSXIdentifier() ? components.get(name.node.name) : undefined;
        if (fn === undefined || included.has(fn.node)) return;
        included.add(fn.node);
        scopes.push(fn);
      },
    });
  const seen = new Set();
  const found = [];
  const report = (rule, node, text) => {
    const key = `${rule}:${node.start}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ rule, file, line: node.loc.start.line, text });
  };
  const header = (element) => {
    if (nameOf(element) === 'DrawerHeader') report('sheetHeader', element.node, 'DrawerHeader');
  };
  const visit = {
    ObjectProperty(property) {
      const key = property.get('key');
      if (!key.isIdentifier({ name: 'backgroundColor' }) || property.node.computed) return;
      for (const text of pageFills(property.get('value')))
        report('sheetSurface', property.node, `backgroundColor: ${text}`);
    },
    JSXAttribute(attr) {
      const name = attr.node.name.name;
      if (name === 'on') {
        const layer = literal(attr);
        if (layer !== undefined && PAGE_LAYERS.has(layer))
          report('sheetSurface', attr.node, `on="${layer}"`);
        return;
      }
      if (!SURFACE_PROPS.has(name)) return;
      const value = attr.get('value');
      const expression = value.isJSXExpressionContainer() ? value.get('expression') : value;
      for (const text of pageFills(expression))
        report('sheetSurface', attr.node, `${name}: ${text}`);
    },
    CallExpression(call) {
      if (!call.get('callee').isIdentifier({ name: 'presentationBackground' })) return;
      const color = call.get('arguments.0');
      const text = color?.node === undefined ? undefined : chain(color.node);
      report('sheetSurface', call.node, `presentationBackground: ${text ?? 'expression'}`);
    },
    JSXElement: (element) => header(element),
  };
  for (const scope of scopes) {
    if (scope.isJSXElement()) header(scope);
    scope.traverse(visit);
  }
  return found;
}
