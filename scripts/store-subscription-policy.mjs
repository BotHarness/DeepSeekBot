import { posix } from 'node:path';
import traverseModule from '@babel/traverse';

const traverse = typeof traverseModule === 'function' ? traverseModule : traverseModule.default;

const CLIENT_SOURCE = /^packages\/client\/src\/.+\.(?:ts|tsx)$/;
const CLIENT_STORE_MODULE = 'packages/client/src/client/store.js';
const SELECTOR_HOOKS = new Map([
  ['useClientStore', 0],
  ['useStoreSlice', 1],
]);

export function appliesToStoreSubscriptions(path) {
  return CLIENT_SOURCE.test(path) && !path.endsWith('/use-client-store.ts');
}

function mentionsClientStore(node) {
  let found = false;
  JSON.stringify(node, (key, value) => {
    if (value?.type === 'Identifier' && value.name === 'ClientStore') found = true;
    if (key === 'loc' || key === 'start' || key === 'end') return undefined;
    return value;
  });
  return found;
}

function mentionsClientState(node) {
  return (
    node?.type === 'TSTypeReference' &&
    node.typeName.type === 'Identifier' &&
    node.typeName.name === 'ClientState'
  );
}

function importsClientStore(file, source) {
  if (!source.startsWith('.')) return false;
  return posix.join(posix.dirname(file), source) === CLIENT_STORE_MODULE;
}

function clientStoreNames(ast, file) {
  const names = new Set();
  traverse(ast, {
    ImportDeclaration(path) {
      if (!importsClientStore(file, path.node.source.value)) return;
      for (const specifier of path.node.specifiers)
        if (
          specifier.type === 'ImportSpecifier' &&
          specifier.imported.type === 'Identifier' &&
          specifier.imported.name === 'store'
        )
          names.add(specifier.local.name);
    },
    Identifier(path) {
      const annotation = path.node.typeAnnotation?.typeAnnotation;
      if (annotation && mentionsClientStore(annotation)) names.add(path.node.name);
    },
    TSPropertySignature(path) {
      const annotation = path.node.typeAnnotation?.typeAnnotation;
      if (path.node.key.type === 'Identifier' && annotation && mentionsClientStore(annotation))
        names.add(path.node.key.name);
    },
  });
  return names;
}

function memberOf(node, property) {
  return node?.type === 'MemberExpression' &&
    node.property.type === 'Identifier' &&
    node.property.name === property &&
    node.object.type === 'Identifier'
    ? node.object.name
    : undefined;
}

function returnsWholeState(node) {
  if (node?.type === 'Identifier') return node.name === 'keepClientState';
  if (node?.type !== 'ArrowFunctionExpression' || node.params.length !== 1) return false;
  const param = node.params[0];
  const body =
    node.body.type === 'BlockStatement' &&
    node.body.body.length === 1 &&
    node.body.body[0].type === 'ReturnStatement'
      ? node.body.body[0].argument
      : node.body;
  return param.type === 'Identifier' && body?.type === 'Identifier' && body.name === param.name;
}

export function findStoreSubscriptions(ast, file) {
  const stores = clientStoreNames(ast, file);
  const found = [];
  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (callee.type !== 'Identifier') return;
      const args = path.node.arguments;
      if (callee.name === 'useSyncExternalStore') {
        const subscribed = memberOf(args[0], 'subscribe');
        if (
          subscribed !== undefined &&
          subscribed === memberOf(args[1], 'getSnapshot') &&
          stores.has(subscribed)
        )
          found.push(path.node);
        return;
      }
      const index = SELECTOR_HOOKS.get(callee.name);
      if (index !== undefined && returnsWholeState(args[index])) found.push(path.node);
    },
    TSPropertySignature(path) {
      if (
        path.node.key.type === 'Identifier' &&
        path.node.key.name === 'state' &&
        mentionsClientState(path.node.typeAnnotation?.typeAnnotation)
      )
        found.push(path.node);
    },
  });
  return found;
}
