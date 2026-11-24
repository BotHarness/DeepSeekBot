import babelTraverse from '@babel/traverse';
import { jsxName } from './ui-rule-controls.mjs';

const traverse = babelTraverse.default ?? babelTraverse;
const SWIFT_UI = '@expo/ui/swift-ui';
const SWIFT_MODIFIERS = `${SWIFT_UI}/modifiers`;
const ICON = /(?:^Icon[A-Z]|(?:Icon|Glyph|Symbol|Mark|Avatar)$)/u;
const DIMENSIONS = ['width', 'height', 'maxWidth', 'maxHeight'];

function importOf(path) {
  if (!path?.isIdentifier() && !path?.isJSXIdentifier()) return undefined;
  const binding = path.scope.getBinding(path.node.name)?.path;
  if (!binding?.isImportSpecifier()) return undefined;
  return { name: binding.node.imported.name, source: binding.parent.source.value };
}

function imported(path, name, source) {
  const entry = importOf(path);
  return entry?.name === name && entry.source === source;
}

function constant(path) {
  if (!path?.isIdentifier()) return undefined;
  const binding = path.scope.getBinding(path.node.name);
  const init = binding?.path.isVariableDeclarator() && binding.path.get('init');
  return binding?.constant &&
    binding.path.get('id').isIdentifier() &&
    init?.node &&
    init.node.end <= path.node.start
    ? init
    : undefined;
}

function property(path, name) {
  if (!path?.isObjectExpression()) return undefined;
  return path
    .get('properties')
    .findLast(
      (entry) =>
        entry.isObjectProperty() &&
        !entry.node.computed &&
        (entry.node.key.name ?? entry.node.key.value) === name,
    )
    ?.get('value');
}

function resolveValue(path) {
  if (!path?.node) return undefined;
  if (path.isTSAsExpression() || path.isTSSatisfiesExpression())
    return resolveValue(path.get('expression'));
  if (path.isSpreadElement()) return resolveValue(path.get('argument'));
  const init = constant(path);
  if (init) return resolveValue(init);
  if (path.isMemberExpression() && !path.node.computed) {
    let object = resolveValue(path.get('object'));
    if (object?.isCallExpression() && object.get('callee').matchesPattern('StyleSheet.create'))
      object = resolveValue(object.get('arguments.0'));
    const value = property(object, path.node.property.name);
    if (value) return resolveValue(value);
  }
  return path;
}

function prop(opening, name) {
  const attribute = opening
    .get('attributes')
    .find((entry) => entry.isJSXAttribute() && entry.get('name').isJSXIdentifier({ name }));
  const value = attribute?.get('value');
  return value?.isJSXExpressionContainer() ? value.get('expression') : value;
}

function isFontScale(path) {
  if (path.isMemberExpression() || path.isOptionalMemberExpression())
    return (
      (path.node.computed ? path.node.property.value : path.node.property.name) === 'fontScale'
    );
  if (path.isCallExpression()) return path.get('callee').matchesPattern('PixelRatio.getFontScale');
  if (!path.isIdentifier()) return false;
  const binding = path.scope.getBinding(path.node.name)?.path;
  const id = binding?.isVariableDeclarator() ? binding.node.id : undefined;
  return (
    path.node.name === 'fontScale' ||
    (id?.type === 'ObjectPattern' &&
      id.properties.some(
        (entry) => entry.key?.name === 'fontScale' && entry.value?.name === path.node.name,
      ))
  );
}

function scaleInSize(value, checkReference = false) {
  const path = resolveValue(value);
  if (!path) return false;
  if (isFontScale(path)) return true;
  if (path.isBinaryExpression() || path.isLogicalExpression())
    return (
      scaleInSize(path.get('left'), checkReference) ||
      ((checkReference || path.node.operator !== '/') &&
        scaleInSize(path.get('right'), checkReference))
    );
  if (path.isConditionalExpression())
    return (
      (checkReference && scaleInSize(path.get('test'), checkReference)) ||
      scaleInSize(path.get('consequent'), checkReference) ||
      scaleInSize(path.get('alternate'), checkReference)
    );
  if (path.isUnaryExpression()) return scaleInSize(path.get('argument'), checkReference);
  if (path.isCallExpression()) {
    const callee = importOf(path.get('callee'));
    if (
      !checkReference &&
      callee?.name === 'clampScaledIconSize' &&
      callee.source.endsWith('/design/scaled-icon-size')
    )
      return scaleInSize(path.get('arguments.2'), true);
    if (!checkReference && path.get('callee').matchesPattern('Math.min'))
      return path.get('arguments').every((arg) => scaleInSize(arg));
    return path.get('arguments').some((arg) => scaleInSize(arg, checkReference));
  }
  return false;
}

function entries(value, includeBranches = false) {
  const path = resolveValue(value);
  if (!path) return [];
  if (path.isArrayExpression())
    return path.get('elements').flatMap((entry) => entries(entry, includeBranches));
  if (path.isArrowFunctionExpression()) return entries(path.get('body'), includeBranches);
  if (includeBranches && path.isConditionalExpression())
    return ['consequent', 'alternate'].flatMap((key) => entries(path.get(key), includeBranches));
  if (includeBranches && path.isLogicalExpression())
    return (path.node.operator === '&&' ? ['right'] : ['left', 'right']).flatMap((key) =>
      entries(path.get(key), includeBranches),
    );
  return [path];
}

function isBounded(value) {
  const path = resolveValue(value);
  if (!path) return false;
  if (path.isConditionalExpression())
    return isBounded(path.get('consequent')) || isBounded(path.get('alternate'));
  return (
    !path.isStringLiteral() &&
    !path.isNullLiteral() &&
    !path.isIdentifier({ name: 'undefined' }) &&
    !path.isIdentifier({ name: 'Infinity' }) &&
    !scaleInSize(path)
  );
}

function bounded(object, dimensions = DIMENSIONS) {
  return dimensions.some((dimension) => isBounded(property(object, dimension)));
}

function fixedStyle(opening, swift) {
  const matchContents = swift ? resolveValue(prop(opening, 'matchContents')) : undefined;
  if (matchContents?.isBooleanLiteral({ value: true })) return false;
  const dimensions = DIMENSIONS.filter((dimension) => {
    const axis = /height/iu.test(dimension) ? 'vertical' : 'horizontal';
    return !property(matchContents, axis)?.isBooleanLiteral({ value: true });
  });
  return entries(prop(opening, 'style'), true).some((style) => bounded(style, dimensions));
}

function modifierArgs(opening, name, includeBranches = false) {
  return entries(prop(opening, 'modifiers'), includeBranches)
    .filter(
      (entry) => entry.isCallExpression() && imported(entry.get('callee'), name, SWIFT_MODIFIERS),
    )
    .map((entry) => resolveValue(entry.get('arguments.0')))
    .filter(Boolean);
}

function enclosingOpenings(opening) {
  const ancestors = [opening];
  for (let path = opening.parentPath.parentPath; path; path = path.parentPath)
    if (path.isJSXElement()) ancestors.push(path.get('openingElement'));
  return ancestors;
}

function hasScalableFont(boxes) {
  for (const box of boxes) {
    const fonts = modifierArgs(box, 'font', true);
    if (fonts.some((args) => property(args, 'textStyle'))) return true;
    if (modifierArgs(box, 'font').length > 0) return false;
  }
  return false;
}

export function modifierEntries(opening) {
  return entries(prop(opening, 'modifiers'), true);
}

export function mobileIconScale(file, ast) {
  const found = [];
  traverse(ast, {
    JSXOpeningElement(opening) {
      const name = jsxName(opening.node.name);
      const original = importOf(opening.get('name'))?.name ?? name;
      const swift = imported(opening.get('name'), 'Image', SWIFT_UI) && prop(opening, 'systemName');
      const scaledIcon =
        ICON.test(original ?? '') &&
        ['size', 'iconSize', 'fontSize'].some((key) => scaleInSize(prop(opening, key)));
      if (!swift && !scaledIcon) return;
      const boxes = enclosingOpenings(opening);
      const styledSymbol = swift && hasScalableFont(boxes);
      if (!styledSymbol && !scaledIcon) return;
      const fixed = boxes.some(
        (box) =>
          fixedStyle(box, styledSymbol) ||
          (styledSymbol && modifierArgs(box, 'frame', true).some((frame) => bounded(frame))),
      );
      const capped =
        styledSymbol &&
        boxes.some((box) =>
          modifierArgs(box, 'dynamicTypeSize').some(
            (args) =>
              args.isStringLiteral() || resolveValue(property(args, 'max'))?.isStringLiteral(),
          ),
        );
      if (fixed && !capped)
        found.push({ rule: 'fixedIconScale', file, line: opening.node.loc.start.line, text: name });
    },
  });
  return found;
}

const COMPOSE = '@expo/ui/jetpack-compose';
const COMPOSE_MODIFIERS = `${COMPOSE}/modifiers`;
const ICON_BUTTON = /^(?:Filled|FilledTonal|Outlined)?IconButton$/u;
const BOX_MODIFIERS = ['size', 'width', 'height', 'requiredSize'];

export function mobileActionScale(file, ast) {
  const found = [];
  traverse(ast, {
    JSXOpeningElement(opening) {
      const button = importOf(opening.get('name'));
      if (button?.source !== COMPOSE || !ICON_BUTTON.test(button.name)) return;
      const scaled = modifierEntries(opening).some(
        (entry) =>
          entry.isCallExpression() &&
          BOX_MODIFIERS.some((name) => imported(entry.get('callee'), name, COMPOSE_MODIFIERS)) &&
          entry.get('arguments').some((arg) => scaleInSize(arg)),
      );
      if (scaled)
        found.push({
          rule: 'scaledActionBox',
          file,
          line: opening.node.loc.start.line,
          text: button.name,
        });
    },
  });
  return found;
}
