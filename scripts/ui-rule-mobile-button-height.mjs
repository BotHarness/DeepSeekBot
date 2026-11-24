import babelTraverse from '@babel/traverse';
import { modifierEntries } from './ui-rule-mobile-icon-scale.mjs';

const traverse = babelTraverse.default ?? babelTraverse;
const COMPOSE = '@expo/ui/jetpack-compose';
const COMPOSE_MODIFIERS = `${COMPOSE}/modifiers`;
const TEXT_BUTTON = /^(?:Button|FilledTonalButton|OutlinedButton|TextButton|ElevatedButton)$/u;
const FIXED = new Set(['height', 'size', 'requiredHeight', 'requiredSize']);

function importOf(path) {
  if (!path?.isIdentifier() && !path?.isJSXIdentifier()) return undefined;
  const binding = path.scope.getBinding(path.node.name)?.path;
  if (!binding?.isImportSpecifier()) return undefined;
  return { name: binding.node.imported.name, source: binding.parent.source.value };
}

export function mobileFixedButtonHeight(file, ast) {
  const found = [];
  traverse(ast, {
    JSXOpeningElement(opening) {
      const button = importOf(opening.get('name'));
      if (button?.source !== COMPOSE || !TEXT_BUTTON.test(button.name)) return;
      const fixed = modifierEntries(opening)
        .filter((entry) => entry.isCallExpression())
        .some((call) => {
          const modifier = importOf(call.get('callee'));
          return modifier?.source === COMPOSE_MODIFIERS && FIXED.has(modifier.name);
        });
      if (fixed)
        found.push({
          rule: 'fixedButtonHeight',
          file,
          line: opening.node.loc.start.line,
          text: button.name,
        });
    },
  });
  return found;
}
