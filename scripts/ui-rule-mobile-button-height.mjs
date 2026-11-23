import babelTraverse from '@babel/traverse';

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

function modifierCalls(opening) {
  const attribute = opening
    .get('attributes')
    .find(
      (entry) => entry.isJSXAttribute() && entry.get('name').isJSXIdentifier({ name: 'modifiers' }),
    );
  const value = attribute?.get('value');
  const list = value?.isJSXExpressionContainer() ? value.get('expression') : undefined;
  return list?.isArrayExpression()
    ? list.get('elements').filter((entry) => entry.isCallExpression())
    : [];
}

export function mobileFixedButtonHeight(file, ast) {
  const found = [];
  traverse(ast, {
    JSXOpeningElement(opening) {
      const button = importOf(opening.get('name'));
      if (button?.source !== COMPOSE || !TEXT_BUTTON.test(button.name)) return;
      const fixed = modifierCalls(opening).some((call) => {
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
