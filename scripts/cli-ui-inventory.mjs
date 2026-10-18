import { parse } from '@babel/parser';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const INVENTORY_PATH = 'scripts/cli-ui-inventory.json';

function walk(node, visit, ancestors = []) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, ancestors);
    return;
  }
  if (typeof node.type === 'string') visit(node, ancestors);
  for (const [key, child] of Object.entries(node))
    if (!['loc', 'start', 'end', 'extra', 'comments', 'tokens'].includes(key))
      walk(child, visit, [...ancestors, node]);
}

export function uiSurfacesFrom(file, source) {
  file = file.replaceAll('\\', '/');
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const text = (node) => source.slice(node.start, node.end).replace(/\s+/g, ' ').trim();
  const surfaces = new Set();
  const add = (kind, value) => surfaces.add(`${kind}:${file}:${value}`);
  const client = file.startsWith('packages/client/src/') || file.includes('/src/client/');
  walk(ast, (node, ancestors) => {
    if (node.type === 'ObjectExpression') {
      const property = (name) =>
        node.properties.find(
          (p) =>
            (p.type === 'ObjectProperty' || p.type === 'ObjectMethod') &&
            (p.key.name === name || p.key.value === name),
        );
      const path = property('path');
      if (path && (property('methods') || property('requestBody') || property('handler'))) {
        const loops = ancestors
          .filter((parent) => parent.type === 'ForOfStatement')
          .map((parent) => text(parent.right));
        add('route', text(path.value) + (loops.length ? ` in ${loops.join('; ')}` : ''));
      }
    }
    if (
      node.type === 'CallExpression' &&
      node.arguments[0]?.type === 'StringLiteral' &&
      node.arguments[0].value.startsWith('/api/') &&
      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(node.arguments[1]?.value)
    )
      add('route', `${text(node.arguments[0])} ${node.arguments[1].value}`);
    if (
      node.type === 'VariableDeclarator' &&
      node.id.name?.endsWith('_FIELD') &&
      node.init?.type === 'StringLiteral'
    )
      add('field', node.init.value);
    if (!client) return;
    if (node.type === 'JSXOpeningElement') {
      const field = node.attributes.find((attr) => attr.name?.name === 'field');
      const scope = node.attributes.find((attr) => attr.name?.name === 'scope');
      if (field?.value && scope) add('field-control', text(field.value));
    }
    if (
      (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') &&
      ['MemberExpression', 'OptionalMemberExpression'].includes(node.callee.type)
    ) {
      const method = node.callee.property.name ?? node.callee.property.value;
      if (['setItem', 'removeItem'].includes(method))
        add('storage', `${method}(${node.arguments[0] ? text(node.arguments[0]) : '<missing>'})`);
    }
    if (node.type === 'JSXOpeningElement' && node.name.name === 'SettingsRow') {
      const title = node.attributes.find((attr) => attr.name?.name === 'title');
      add('setting', title?.value ? text(title.value) : '<no title>');
    }
  });
  return [...surfaces].sort();
}

export function checkUiInventory(surfaces, inventory, cliSource) {
  const errors = [];
  const owners = new Map();
  for (const group of inventory.groups) {
    if (!group.id || !group.scope || !group.description)
      errors.push('CLI UI inventory group needs an id, scope and description');
    const states = [group.commands?.length > 0, Boolean(group.issue), Boolean(group.exemption)];
    if (states.filter(Boolean).length !== 1)
      errors.push(
        `CLI UI inventory ${group.id} needs exactly one command mapping, issue or exemption`,
      );
    if (group.issue && !/^#\d+$/.test(group.issue))
      errors.push(`CLI UI inventory ${group.id} needs a specific issue reference`);
    if (group.exemption && group.configurable !== false)
      errors.push(
        `CLI UI inventory ${group.id} may exempt only explicitly nonconfigurable surfaces`,
      );
    for (const command of group.commands ?? []) {
      if (!cliSource.includes(`'${command}'`) && !cliSource.includes(`"${command}"`))
        errors.push(`CLI UI inventory ${group.id} references missing command ${command}`);
    }
    for (const surface of group.surfaces) {
      if (owners.has(surface)) errors.push(`CLI UI inventory duplicates ${surface}`);
      owners.set(surface, group.id);
    }
  }
  const current = new Set(surfaces);
  for (const surface of current)
    if (!owners.has(surface))
      errors.push(
        `CLI UI inventory missing ${surface}; map the setting/action to a command, follow-up issue or justified nonconfigurable exemption`,
      );
  for (const surface of owners.keys())
    if (!current.has(surface))
      errors.push(`CLI UI inventory stale ${surface}; review and remove the old entry`);
  return errors;
}

export function readUiSurfaces(root) {
  const surfaces = [];
  function scan(directory) {
    for (const entry of readdirSync(directory)) {
      const file = join(directory, entry);
      if (statSync(file).isDirectory()) scan(file);
      else if (/\.tsx?$/.test(entry) && !entry.endsWith('.d.ts'))
        surfaces.push(...uiSurfacesFrom(relative(root, file), readFileSync(file, 'utf8')));
    }
  }
  for (const name of readdirSync(join(root, 'packages'))) {
    const src = join(root, 'packages', name, 'src');
    try {
      if (statSync(src).isDirectory()) scan(src);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return surfaces.sort();
}
