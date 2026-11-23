import babelTraverse from '@babel/traverse';

const traverse = babelTraverse.default ?? babelTraverse;
const SWIFT_MODIFIERS = '@expo/ui/swift-ui/modifiers';

function importedName(path) {
  if (!path?.isIdentifier()) return undefined;
  const binding = path.scope.getBinding(path.node.name)?.path;
  if (!binding?.isImportSpecifier()) return undefined;
  return binding.parent.source.value === SWIFT_MODIFIERS ? binding.node.imported.name : undefined;
}

export function mobileWrappingCapsule(file, ast) {
  const found = [];
  traverse(ast, {
    CallExpression(call) {
      if (importedName(call.get('callee')) !== 'buttonBorderShape') return;
      const shape = call.get('arguments.0');
      if (shape?.isStringLiteral({ value: 'capsule' }))
        found.push({
          rule: 'wrappingCapsule',
          file,
          line: call.node.loc.start.line,
          text: 'buttonBorderShape',
        });
    },
  });
  return found;
}
