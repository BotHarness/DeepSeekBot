import { posix } from 'node:path';
import babelTraverse from '@babel/traverse';

const traverse = babelTraverse.default ?? babelTraverse;
const DS = 'packages/client/src/client/ds';
const LEGACY_RENDERER = 'packages/client/src/client/channel-sidebar-icon.tsx';
const DSH_UI = /^@deepseek-ai\/dsh-client-ui(?:-[\w-]+)?(?:\/|$)/u;
const ICON_LIB = /^(?:lucide-react|react-icons(?:\/|$)|@tabler\/icons-react)/u;
const ICON_EXPORT = /^(?:Icon[A-Z]|[A-Z]\w*(?:Icon|Glyph)$)/u;
const DSH_ICONS = {
  Branch: 'git-branch',
  Check: 'check',
  ChevronDown: 'chevron-down',
  ChevronLeft: 'chevron-left',
  ChevronRight: 'chevron-right',
  ChevronUp: 'chevron-up',
  Close: 'x',
  Copy: 'copy',
  Edit: 'pencil',
  Ellipsis: 'ellipsis',
  Globe: 'globe',
  Link: 'link',
  PanelLeft: 'panel-left',
  Plus: 'plus',
  Refresh: 'refresh-cw',
  Search: 'search',
  Settings: 'settings',
  Share: 'share',
};

export function jsxName(node) {
  if (node?.type === 'JSXIdentifier') return node.name;
  if (node?.type === 'JSXMemberExpression') return `${jsxName(node.object)}.${node.property.name}`;
  return undefined;
}

export function attribute(opening, name) {
  return opening.attributes.find((item) => item.type === 'JSXAttribute' && item.name.name === name);
}

export function jsxValue(attr) {
  return attr?.value?.type === 'JSXExpressionContainer' ? attr.value.expression : attr?.value;
}

export function dsImports(ast, file) {
  const imports = new Map();
  for (const statement of ast.program.body) {
    if (statement.type !== 'ImportDeclaration') continue;
    const path = posix.normalize(posix.join(posix.dirname(file), statement.source.value));
    if (statement.source.value.startsWith('.') && path.startsWith(`${DS}/`))
      for (const item of statement.specifiers)
        if (item.type === 'ImportSpecifier') imports.set(item.local.name, item.imported.name);
  }
  return imports;
}

function hasSpread(opening) {
  return opening.attributes.some(({ type }) => type === 'JSXSpreadAttribute');
}

function emptyValue(value) {
  return (
    !value ||
    value.type === 'NullLiteral' ||
    (value.type === 'Identifier' && value.name === 'undefined') ||
    (value.type === 'UnaryExpression' && value.operator === 'void') ||
    (value.type === 'StringLiteral' && !value.value.trim()) ||
    (value.type === 'TemplateLiteral' &&
      !value.expressions.length &&
      !value.quasis[0].value.cooked?.trim()) ||
    (value.type === 'BooleanLiteral' && value.value === false)
  );
}

function named(opening) {
  return ['aria-label', 'aria-labelledby'].some(
    (name) => !emptyValue(jsxValue(attribute(opening, name))),
  );
}

function isTrue(attr) {
  const value = jsxValue(attr);
  return !!attr && (!attr.value || value?.value === true || value?.value === 'true');
}

function decorative(child, imports) {
  if (child.type === 'JSXText') return !child.value.trim();
  if (child.type === 'JSXExpressionContainer')
    return child.expression.type === 'JSXEmptyExpression' || decorative(child.expression, imports);
  if (child.type === 'JSXFragment')
    return child.children.every((item) => decorative(item, imports));
  if (child.type !== 'JSXElement') return false;
  const opening = child.openingElement;
  const name = jsxName(opening.name);
  if (
    isTrue(attribute(opening, 'aria-hidden')) ||
    name === 'svg' ||
    name === 'Icon' ||
    imports.get(name) === 'Icon' ||
    name?.endsWith('Icon') ||
    ICON_EXPORT.test(name ?? '')
  )
    return true;
  return (
    ['span', 'div'].includes(name) &&
    !attribute(opening, 'aria-label') &&
    child.children.every((item) => decorative(item, imports))
  );
}

function inspectNames(node, imports, add) {
  const opening = node.openingElement;
  const local = jsxName(opening.name);
  const name = imports.get(local) ?? local;
  if (!name) return;
  const iconOnly = jsxValue(attribute(opening, 'iconOnly'));
  const rawRole = jsxValue(attribute(opening, 'role'))?.value;
  const needsName =
    name === 'IconButton' ||
    (name === 'NavItem' && attribute(opening, 'iconOnly') && iconOnly?.value !== false) ||
    ((['Button', 'button', 'a'].includes(name) || ['button', 'link'].includes(rawRole)) &&
      node.children.every((child) => decorative(child, imports)) &&
      (node.children.length > 0 || attribute(opening, 'icon')));
  if (needsName && !hasSpread(opening) && !named(opening)) add('accessibleName', name, opening);

  const attention = attribute(opening, 'attention');
  if (name === 'NavItem' && attention) {
    const value = jsxValue(attention);
    if (
      !attention.value ||
      (value?.type === 'BooleanLiteral' && value.value) ||
      (value?.type === 'StringLiteral' && !value.value.trim())
    )
      add('statusLabel', 'NavItem.attention', attention);
  }
  const status =
    /(?:AttentionDot|StatusDot|StateDot)$/u.test(name) ||
    opening.attributes.some(
      (attr) =>
        attr.type === 'JSXAttribute' &&
        /^data-[\w-]*(?:attention|status-dot)$/u.test(attr.name.name ?? ''),
    );
  if (
    status &&
    !hasSpread(opening) &&
    !named(opening) &&
    !isTrue(attribute(opening, 'aria-hidden')) &&
    emptyValue(jsxValue(attribute(opening, 'label'))) &&
    node.children.every((child) => decorative(child, imports))
  )
    add('statusLabel', name, opening);
}

const FOCUS = /:focus-visible|\[data-focus-visible(?:\]|=)/u;
const DISABLED = /:disabled|\[(?:aria-disabled|data-disabled|disabled)(?:\]|=)/u;

function isStyleProps(node) {
  return (
    node?.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.object.name === 'stylex' &&
    node.callee.property.name === 'props'
  );
}

function styleReferences(opening, localStyles, walk) {
  const references = new Set();
  const followed = new Set();
  function collect(expression) {
    if (!expression) return;
    if (expression.type === 'Identifier' && localStyles.has(expression.name)) {
      if (followed.has(expression.name)) return;
      followed.add(expression.name);
      walk(localStyles.get(expression.name), collect);
      return;
    }
    if (
      expression.type === 'MemberExpression' &&
      expression.object.type === 'Identifier' &&
      expression.property.type === 'Identifier'
    )
      references.add(`${expression.object.name}.${expression.property.name}`);
  }
  for (const attr of opening.attributes)
    if (attr.type === 'JSXSpreadAttribute' || ['className', 'style'].includes(attr.name.name))
      walk(attr.type === 'JSXSpreadAttribute' ? attr.argument : jsxValue(attr), collect);
  return references;
}

function inspectFocus(node, source, cssBlocks, localStyles, baseUi, add, walk) {
  const name = jsxName(node.name);
  const role = jsxValue(attribute(node, 'role'))?.value;
  const [namespace, member] = name?.split('.') ?? [];
  const widget =
    ['button', 'input', 'select', 'textarea'].includes(name) ||
    ['button', 'checkbox', 'switch', 'slider', 'option', 'tab', 'menuitem'].includes(role) ||
    (baseUi.has(namespace) &&
      [
        'Trigger',
        'Close',
        'Item',
        'CheckboxItem',
        'RadioItem',
        'SubmenuTrigger',
        'Input',
        'Tab',
        'Thumb',
      ].includes(member)) ||
    (member === 'Root' && /\/(?:checkbox|switch)$/u.test(baseUi.get(namespace) ?? ''));
  const link = name === 'a' && attribute(node, 'href');
  if ((!widget && !link) || jsxValue(attribute(node, 'type'))?.value === 'hidden') return;
  const references = styleReferences(node, localStyles, walk);
  const blocks = [...references].flatMap((ref) => (cssBlocks.has(ref) ? [cssBlocks.get(ref)] : []));
  let focus = false;
  let disabled = false;
  for (const block of blocks)
    walk(block, (entry) => {
      const key =
        entry.type === 'ObjectProperty' ? source.slice(entry.key.start, entry.key.end) : '';
      if (
        FOCUS.test(key) &&
        !emptyValue(entry.value) &&
        !['none', 'transparent', '0', '0px', 0].includes(entry.value?.value)
      )
        focus = true;
      disabled ||= DISABLED.test(key);
    });
  disabled ||= [...references].some((ref) => /\.disabled\w*$/iu.test(ref) && cssBlocks.has(ref));
  if (!focus) add('focusVisible', name, node);
  if (widget && !disabled) add('disabledStyle', name, node);
}

export function desktopControls(source, file, ast, walk) {
  const inDs = file.startsWith(`${DS}/`);
  const imports = dsImports(ast, file);
  const baseUi = new Map();
  const dshNamespaces = new Set();
  const cssBlocks = new Map();
  const localStyles = new Map();
  const found = [];
  const add = (rule, text, node) => found.push({ rule, file, line: node.loc.start.line, text });
  walk(ast.program, (node) => {
    if (node.type === 'ImportDeclaration') {
      const module = node.source.value;
      for (const item of node.specifiers) {
        const imported = item.imported?.name ?? item.imported?.value;
        if (module.startsWith('@base-ui/react/') && node.importKind !== 'type')
          baseUi.set(item.local.name, module);
        if (node.importKind === 'type' || item.importKind === 'type') continue;
        if (DSH_UI.test(module) && item.type === 'ImportNamespaceSpecifier')
          dshNamespaces.add(item.local.name);
        if (ICON_LIB.test(module)) add('iconSource', imported ?? item.local.name, item);
        if (
          DSH_UI.test(module) &&
          (ICON_EXPORT.test(imported ?? '') || (module.includes('/icons') && !imported))
        )
          add('iconSource', imported ?? item.local.name, item);
        if (
          imported === 'ChannelSidebarIcon' &&
          /(?:^|\/)channel-sidebar-icon\.[jt]sx?$/u.test(module) &&
          file !== `${DS}/icon.tsx`
        )
          add('iconSource', imported, item);
      }
    }
    if (
      node.type === 'ExportNamedDeclaration' &&
      node.exportKind !== 'type' &&
      DSH_UI.test(node.source?.value ?? '')
    )
      for (const item of node.specifiers) {
        const exported = item.local?.name;
        if (item.exportKind !== 'type' && ICON_EXPORT.test(exported ?? ''))
          add('iconSource', exported, item);
      }
    if (
      !inDs &&
      file !== LEGACY_RENDERER &&
      ((node.type === 'TemplateElement' && /<svg[\s>]/u.test(node.value.raw)) ||
        (node.type === 'StringLiteral' && /<svg[\s>]/u.test(node.value)))
    )
      add('iconSource', '<svg> markup', node);
    if (inDs && node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
      if (isStyleProps(node.init)) localStyles.set(node.id.name, node.init);
      const callee = node.init?.callee;
      if (
        callee?.type === 'MemberExpression' &&
        callee.object.name === 'stylex' &&
        callee.property.name === 'create' &&
        node.init.arguments[0]?.type === 'ObjectExpression'
      )
        for (const item of node.init.arguments[0].properties) {
          const key = item.key?.name ?? item.key?.value;
          if (key && item.value) cssBlocks.set(`${node.id.name}.${key}`, item.value);
        }
    }
  });
  walk(ast.program, (node) => {
    if (node.type !== 'JSXElement') return;
    const opening = node.openingElement;
    const name = jsxName(opening.name);
    if (!inDs && file !== LEGACY_RENDERER && name === 'svg') add('iconSource', '<svg>', opening);
    const [namespace, iconMember] = name?.split('.') ?? [];
    if (dshNamespaces.has(namespace) && ICON_EXPORT.test(iconMember ?? ''))
      add('iconSource', name, opening);
    inspectNames(node, imports, add);
    if (inDs) inspectFocus(opening, source, cssBlocks, localStyles, baseUi, add, walk);
  });
  return found;
}

export function fixDesktopIcons(source, file, ast) {
  const edits = [];
  const imports = dsImports(ast, file);
  let icon = [...imports].find(([, name]) => name === 'Icon')?.[0];
  const existingIcon = icon;
  if (!icon) {
    icon = 'Icon';
    for (let index = 1; new RegExp(`\\b${icon}\\b`, 'u').test(source); index += 1)
      icon = `TobsIcon${index}`;
  }
  traverse(ast, {
    ImportDeclaration(path) {
      const statement = path.node;
      if (!DSH_UI.test(statement.source.value) || statement.importKind === 'type') return;
      const migrated = new Set();
      for (const item of statement.specifiers) {
        const key = /^Icon(\w+)Outline(?:Regular|Medium)$/u.exec(item.imported?.name ?? '')?.[1];
        const glyph = DSH_ICONS[key];
        if (!glyph || item.importKind === 'type') continue;
        const binding = path.scope.getBinding(item.local.name);
        if (!binding?.referencePaths.length) continue;
        const openings = [];
        for (const reference of binding.referencePaths) {
          const parent = reference.parent;
          if (
            parent.type === 'JSXOpeningElement' &&
            parent.name === reference.node &&
            parent.selfClosing &&
            parent.attributes.every(
              (attr) =>
                attr.type === 'JSXAttribute' &&
                ['className', 'size', 'key'].includes(attr.name.name),
            )
          )
            openings.push(reference.node);
        }
        if (openings.length !== binding.referencePaths.length) continue;
        if (
          existingIcon &&
          binding.referencePaths.some(
            (ref) => ref.scope.getBinding(existingIcon)?.kind !== 'module',
          )
        )
          continue;
        for (const node of openings)
          edits.push({ start: node.start, end: node.end, next: `${icon} name="${glyph}"` });
        migrated.add(item);
      }
      if (!migrated.size) return;
      const named = statement.specifiers.filter((item) => item.type === 'ImportSpecifier');
      const retained = named.filter((item) => !migrated.has(item));
      if (statement.specifiers.length === migrated.size)
        edits.push({ start: statement.start, end: statement.end, next: '' });
      else if (retained.length)
        edits.push({
          start: named[0].start,
          end: named.at(-1).end,
          next: retained.map((item) => source.slice(item.start, item.end)).join(', '),
        });
      else {
        const other = statement.specifiers.find((item) => item.type !== 'ImportSpecifier');
        edits.push({ start: other.end, end: statement.source.start, next: ' from ' });
      }
    },
  });
  if (!edits.length) return source;
  if (!existingIcon) {
    let target = posix.relative(posix.dirname(file), `${DS}/icon.js`);
    if (!target.startsWith('.')) target = `./${target}`;
    const start = ast.program.body[0].start;
    const specifier = icon === 'Icon' ? icon : `Icon as ${icon}`;
    edits.push({ start, end: start, next: `import { ${specifier} } from '${target}';\n` });
  }
  return edits
    .sort((a, b) => b.start - a.start || b.end - a.end)
    .reduce(
      (current, { start, end, next }) => current.slice(0, start) + next + current.slice(end),
      source,
    );
}
