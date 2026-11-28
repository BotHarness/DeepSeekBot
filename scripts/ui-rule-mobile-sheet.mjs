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
const OVERLAY_FILL = /^theme\.overlay\.fill$/u;
const PAGE_LAYERS = new Set(['canvas', 'well', 'field']);
const SURFACE_PROPS = new Set(['containerColor', 'backgroundColor', 'backdropColor']);

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

function osBranches(test) {
  if (!test.isBinaryExpression()) return undefined;
  const { operator, left, right } = test.node;
  const equal = operator === '===' || operator === '==';
  if (!equal && operator !== '!==' && operator !== '!=') return undefined;
  const os = [left, right].find((side) => chain(side) === 'Platform.OS');
  const literal = [left, right].find((side) => side.type === 'StringLiteral');
  if (os === undefined || literal === undefined) return undefined;
  const ios = literal.value === 'ios';
  return equal ? { consequent: !ios, alternate: ios } : { consequent: ios, alternate: !ios };
}

const OFF_IOS = new Set(['android', 'web']);

function pageFills(path, offIos = false) {
  if (path.isConditionalExpression()) {
    const branches = osBranches(path.get('test'));
    return [
      ...pageFills(path.get('consequent'), offIos || branches?.consequent === true),
      ...pageFills(path.get('alternate'), offIos || branches?.alternate === true),
    ];
  }
  if (path.isLogicalExpression())
    return [...pageFills(path.get('left'), offIos), ...pageFills(path.get('right'), offIos)];
  if (path.isCallExpression() && chain(path.node.callee) === 'Platform.select') {
    const options = path.get('arguments.0');
    if (!options?.isObjectExpression()) return [];
    return options.get('properties').flatMap((property) => {
      if (!property.isObjectProperty()) return [];
      const key = property.node.key;
      const name = key.type === 'Identifier' ? key.name : key.value;
      return pageFills(property.get('value'), offIos || OFF_IOS.has(name));
    });
  }
  if (path.isStringLiteral())
    return path.node.value === 'transparent' || path.node.value === 'clear'
      ? []
      : [JSON.stringify(path.node.value)];
  const text = chain(path.node);
  if (text === undefined) return [];
  if (OVERLAY_FILL.test(text)) return offIos ? [] : [text];
  return PAGE_FILL.test(text) ? [text] : [];
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

function implicitWhite(file, ast) {
  const found = [];
  traverse(ast, {
    JSXElement(element) {
      if (nameOf(element) !== 'Modal') return;
      const style = literal(attribute(element, 'presentationStyle'));
      if (!PAGE_SHEET.has(style)) return;
      if (attribute(element, 'backdropColor')) return;
      const transparent = attribute(element, 'transparent');
      const value = transparent?.get('value');
      const expression = value?.isJSXExpressionContainer() ? value.get('expression') : undefined;
      if (transparent && !expression?.isBooleanLiteral({ value: false })) return;
      found.push({
        rule: 'sheetSurface',
        file,
        line: element.node.loc.start.line,
        text: `Modal ${style} without backdropColor`,
      });
    },
  });
  return found;
}

export function mobileSheetSurface(file, ast) {
  if (PRIMITIVES.test(file)) return implicitWhite(file, ast);
  return [...implicitWhite(file, ast), ...sheetBody(file, ast)];
}

function sheetBody(file, ast) {
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
      if (!SURFACE_PROPS.has(name) && name !== 'contentColor') return;
      const opening = attr.parentPath;
      const owner = opening.get('name');
      if (owner.isJSXIdentifier({ name: 'ModalBottomSheet' }) && name !== 'backgroundColor') {
        report('sheetSurface', attr.node, `ModalBottomSheet ${name}`);
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

const CHOICE_SHEETS = new Set(['Sheet', 'SheetFrame', 'BottomSheet']);
const CHOICE_ROWS = new Set(['CheckmarkRow', 'RadioMark']);
const NATIVE_SLOT = /^(?:SystemListSheet|Native\w*Sheet)$/u;
const EXEMPT = /^\s*sheet-choice-exempt:\s*(.*?)\s*$/u;
const REASON = 12;

function selectableRow(opening) {
  const name = opening.get('name');
  if (!name.isJSXIdentifier()) return false;
  if (CHOICE_ROWS.has(name.node.name)) return true;
  if (!/Row$/u.test(name.node.name)) return false;
  return opening.get('attributes').some((attr) => {
    if (!attr.isJSXAttribute()) return false;
    if (attr.node.name.name === 'selected') return true;
    if (attr.node.name.name !== 'control') return false;
    let check = false;
    attr.traverse({
      StringLiteral(text) {
        if (text.node.value === 'check') check = true;
      },
    });
    return check;
  });
}

function nativeTest(test) {
  if (!test.isBinaryExpression()) return undefined;
  const { operator, left, right } = test.node;
  const equal = operator === '===' || operator === '==';
  if (!equal && operator !== '!==' && operator !== '!=') return undefined;
  const sides = [left, right];
  if (!sides.some((side) => side.type === 'Identifier' && NATIVE_SLOT.test(side.name)))
    return undefined;
  if (!sides.some((side) => side.type === 'Identifier' && side.name === 'undefined'))
    return undefined;
  return equal ? 'consequent' : 'alternate';
}

function returns(statement) {
  if (statement.isReturnStatement()) return true;
  if (!statement.isBlockStatement()) return false;
  const body = statement.get('body');
  return body.length > 0 && body[body.length - 1].isReturnStatement();
}

function fallbackPath(path) {
  let child = path;
  for (let parent = path.parentPath; parent !== null; child = parent, parent = parent.parentPath) {
    if (parent.isFunction()) return false;
    if (parent.isConditionalExpression() || parent.isIfStatement()) {
      const fallback = nativeTest(parent.get('test'));
      if (fallback !== undefined && child.key === fallback) return true;
    }
    if (parent.isBlockStatement() && typeof child.key === 'number') {
      const earlier = parent.get('body').slice(0, child.key);
      if (
        earlier.some(
          (statement) =>
            statement.isIfStatement() &&
            nativeTest(statement.get('test')) === 'alternate' &&
            returns(statement.get('consequent')),
        )
      )
        return true;
    }
  }
  return false;
}

export function mobileSheetChoice(file, ast) {
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
  const comments = ast.comments ?? [];
  const found = [];
  const owners = new Map([...components].map(([name, fn]) => [fn.node, name]));
  const renderings = new Map();
  traverse(ast, {
    JSXOpeningElement(opening) {
      const tag = opening.get('name');
      if (!tag.isJSXIdentifier() || !components.has(tag.node.name)) return;
      const list = renderings.get(tag.node.name) ?? [];
      list.push(opening.parentPath);
      renderings.set(tag.node.name, list);
    },
  });
  const covered = (element, seen = new Set()) => {
    if (fallbackPath(element)) return true;
    let fn = element.getFunctionParent();
    while (fn !== null && !owners.has(fn.node)) {
      if (fallbackPath(fn)) return true;
      fn = fn.getFunctionParent();
    }
    if (fn === null) return false;
    const name = owners.get(fn.node);
    if (seen.has(name)) return false;
    seen.add(name);
    const uses = renderings.get(name) ?? [];
    return uses.length > 0 && uses.every((jsx) => covered(jsx, new Set(seen)));
  };
  traverse(ast, {
    JSXElement(element) {
      const name = nameOf(element);
      if (!CHOICE_SHEETS.has(name)) return;
      let choice = false;
      let native = false;
      const seen = new Set();
      const scan = (path) =>
        path.traverse({
          JSXOpeningElement(opening) {
            const tag = opening.get('name');
            if (tag.isJSXIdentifier({ name: 'List' })) native = true;
            if (selectableRow(opening)) choice = true;
            const inner = tag.isJSXIdentifier() ? components.get(tag.node.name) : undefined;
            if (inner !== undefined && !seen.has(inner.node)) {
              seen.add(inner.node);
              scan(inner);
            }
          },
        });
      scan(element);
      if (!choice || native || covered(element)) return;
      const line = element.node.loc.start.line;
      const exemption = comments
        .filter((comment) => comment.loc.end.line >= line - 1 && comment.loc.end.line <= line)
        .map((comment) => EXEMPT.exec(comment.value.replace(/^\s*\*?\s*/u, '')))
        .find((match) => match !== null);
      if (exemption && exemption[1].length >= REASON) return;
      found.push({
        rule: 'sheetChoice',
        file,
        line,
        text: exemption ? `${name} exemption without a reason` : `${name} with selectable rows`,
      });
    },
  });
  return found;
}
