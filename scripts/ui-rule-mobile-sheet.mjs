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

function platformTest(path) {
  let found = false;
  path.traverse({
    MemberExpression(member) {
      if (chain(member.node) === 'Platform.OS') found = true;
    },
  });
  return found || (path.isMemberExpression() && chain(path.node) === 'Platform.OS');
}

function pageFills(path, platform = false) {
  if (path.isConditionalExpression()) {
    const guarded = platform || platformTest(path.get('test'));
    return [
      ...pageFills(path.get('consequent'), guarded),
      ...pageFills(path.get('alternate'), guarded),
    ];
  }
  if (path.isLogicalExpression())
    return [...pageFills(path.get('left'), platform), ...pageFills(path.get('right'), platform)];
  if (path.isStringLiteral())
    return path.node.value === 'transparent' || path.node.value === 'clear'
      ? []
      : [JSON.stringify(path.node.value)];
  const text = chain(path.node);
  if (text === undefined) return [];
  if (OVERLAY_FILL.test(text)) return platform ? [] : [text];
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

function systemListTest(test) {
  if (!test.isBinaryExpression() || !['!==', '===', '!=', '=='].includes(test.node.operator))
    return false;
  const sides = [test.node.left, test.node.right];
  return (
    sides.some((side) => side.type === 'Identifier' && NATIVE_SLOT.test(side.name)) &&
    sides.some((side) => side.type === 'Identifier' && side.name === 'undefined')
  );
}

function systemListFallback(program) {
  let covered = false;
  program.traverse({
    'IfStatement|ConditionalExpression'(branch) {
      if (systemListTest(branch.get('test'))) covered = true;
    },
  });
  return covered;
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
  let covered = false;
  traverse(ast, {
    Program(program) {
      covered = systemListFallback(program);
      program.stop();
    },
  });
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
      if (!choice || native || covered) return;
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
