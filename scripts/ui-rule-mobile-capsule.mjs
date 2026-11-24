import babelTraverse from '@babel/traverse';

const traverse = babelTraverse.default ?? babelTraverse;
const SWIFT_MODIFIERS = '@expo/ui/swift-ui/modifiers';

function importedName(path) {
  if (!path?.isIdentifier()) return undefined;
  const binding = path.scope.getBinding(path.node.name)?.path;
  if (!binding?.isImportSpecifier()) return undefined;
  return binding.parent.source.value === SWIFT_MODIFIERS ? binding.node.imported.name : undefined;
}

function key(property) {
  if (!property.isObjectProperty() || property.node.computed) return undefined;
  const name = property.get('key');
  return name.isIdentifier() ? name.node.name : undefined;
}

function roundToken(value) {
  return (
    value.isMemberExpression() &&
    !value.node.computed &&
    value.get('object').isIdentifier({ name: 'radius' }) &&
    value.get('property').isIdentifier({ name: 'round' })
  );
}

const FIXED = new Set(['height', 'width', 'aspectRatio']);

export function mobileWrappingCapsule(file, ast) {
  const found = [];
  const native = !/\.android\.[jt]sx?$/u.test(file);
  traverse(ast, {
    ObjectExpression(object) {
      if (!native) return;
      const properties = object.get('properties');
      const names = new Set(properties.map(key));
      if (!names.has('minHeight') || [...FIXED].some((name) => names.has(name))) return;
      const radius = properties.find(
        (property) => key(property) === 'borderRadius' && roundToken(property.get('value')),
      );
      if (radius)
        found.push({
          rule: 'wrappingCapsule',
          file,
          line: radius.node.loc.start.line,
          text: 'borderRadius',
        });
    },
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
