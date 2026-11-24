import babelTraverse from '@babel/traverse';
import { jsxName } from './ui-rule-controls.mjs';
import { modifierEntries, scaleInSize } from './ui-rule-mobile-icon-scale.mjs';

const traverse = babelTraverse.default ?? babelTraverse;
const ICON = /(?:^Icon[A-Z]|(?:Icon|Glyph|Symbol|SymbolView)$)/u;
const SWIFT_UI = '@expo/ui/swift-ui';
const TEXT = /^(?:Text|InlineText|SystemText)$/u;

function attribute(opening, name) {
  const found = opening
    .get('attributes')
    .find((entry) => entry.isJSXAttribute() && entry.get('name').isJSXIdentifier({ name }));
  const value = found?.get('value');
  return value?.isJSXExpressionContainer() ? value.get('expression') : value;
}

function swiftImport(opening) {
  const path = opening.get('name');
  if (!path.isJSXIdentifier()) return false;
  const binding = path.scope.getBinding(path.node.name)?.path;
  return binding?.isImportSpecifier() && binding.parent.source.value === SWIFT_UI;
}

function fixedSwiftSymbol(opening) {
  if (!attribute(opening, 'systemName')) return false;
  const size = attribute(opening, 'size');
  if (size?.node && !scaleInSize(size)) return true;
  return modifierEntries(opening).some((entry) => {
    if (!entry.isCallExpression() || !entry.get('callee').isIdentifier({ name: 'font' }))
      return false;
    const args = entry.get('arguments.0');
    if (!args?.isObjectExpression()) return false;
    const keys = args.node.properties.map((property) => property.key?.name);
    return keys.includes('size') && !keys.includes('textStyle');
  });
}

function originalName(opening) {
  const path = opening.get('name');
  if (!path.isJSXIdentifier()) return jsxName(opening.node.name);
  const binding = path.scope.getBinding(path.node.name)?.path;
  return binding?.isImportSpecifier() ? binding.node.imported.name : path.node.name;
}

export function mobileLabelIcon(file, ast) {
  const found = [];
  traverse(ast, {
    JSXOpeningElement(opening) {
      const name = originalName(opening);
      if (name === 'Image' && swiftImport(opening)) {
        if (!fixedSwiftSymbol(opening)) return;
      } else {
        if (!ICON.test(name ?? '')) return;
        const size = ['size', 'iconSize'].map((key) => attribute(opening, key)).find(Boolean);
        if (!size?.node || scaleInSize(size)) return;
      }
      const parent = opening.parentPath.parentPath;
      if (!parent?.isJSXElement()) return;
      const labelled = parent
        .get('children')
        .some(
          (child) =>
            child.isJSXElement() && TEXT.test(originalName(child.get('openingElement')) ?? ''),
        );
      if (labelled)
        found.push({
          rule: 'unscaledLabelIcon',
          file,
          line: opening.node.loc.start.line,
          text: name,
        });
    },
  });
  return found;
}
