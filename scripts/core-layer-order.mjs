import { countsByRule } from './baseline-counts.mjs';

export const CORE_SOURCE = 'packages/core/src';
export const CORE_LAYER_BASELINE = 'scripts/core-layer-baseline.json';
const CORE_LAYER_ORDER = [
  ['kernel', ['contracts', 'fs', 'kernel', 'logs', 'media', 'system', 'window-zoom']],
  ['database', ['database']],
  [
    'domain',
    [
      'appearance',
      'attachments',
      'authorization',
      'bots',
      'channels',
      'cloud',
      'companions',
      'connectors',
      'credentials',
      'data-reset',
      'desktop-window',
      'devices',
      'diagnostics',
      'engines',
      'execution',
      'humans',
      'im',
      'live-activity',
      'marketplace',
      'memory',
      'messaging',
      'models',
      'onboarding',
      'portability',
      'process',
      'prompts',
      'purge',
      'push',
      'release',
      'roster',
      'schedules',
      'sessions',
      'skills',
      'state',
      'storage',
      'takeover',
      'team',
      'team-policy',
      'telemetry',
      'tob',
      'usage',
      'voice',
      'workspaces',
    ],
  ],
  ['runtime', ['runtime']],
  ['features', ['features']],
  [
    'composition',
    [
      'agent-adapter.ts',
      'bridge',
      'cli',
      'http',
      'core.ts',
      'feature-contributions.ts',
      'host-core-options.ts',
      'index.ts',
      'plugin-types.ts',
      'plugin.ts',
    ],
  ],
];

const layers = new Map(
  CORE_LAYER_ORDER.flatMap(([name, modules], tier) =>
    modules.map((module) => [module, { name, tier: tier + 1 }]),
  ),
);
const composition = layers.get('index.ts');
const sourceExtension = /\.[cm]?[jt]sx?$/u;
const nonRuntimeSource = /(?:\.(?:d|spec|test)\.[cm]?[jt]sx?$|\/(?:__tests__|test|tests)\/)/u;

function isCoreDirectory(name) {
  return layers.has(name) && !sourceExtension.test(name);
}

export function unclassifiedCoreDirectory(name) {
  return isCoreDirectory(name)
    ? undefined
    : `${CORE_SOURCE}/${name}: no Host core layer assigned; add the directory to CORE_LAYER_ORDER in scripts/core-layer-order.mjs`;
}

export function unclassifiedCoreTopLevelFile(name) {
  if (!isCoreRuntimeFile(`${CORE_SOURCE}/${name}`)) return undefined;
  return layers.has(name)
    ? undefined
    : `${CORE_SOURCE}/${name}: no Host core layer assigned; add the file to CORE_LAYER_ORDER in scripts/core-layer-order.mjs`;
}

export function isCoreRuntimeFile(file) {
  return (
    file.startsWith(`${CORE_SOURCE}/`) && sourceExtension.test(file) && !nonRuntimeSource.test(file)
  );
}

function coreModule(path) {
  if (path === CORE_SOURCE || path === `${CORE_SOURCE}/`) return 'index.ts';
  if (!path.startsWith(`${CORE_SOURCE}/`)) return undefined;
  const [entry, child, nested] = path.slice(CORE_SOURCE.length + 1).split('/');
  if (entry === 'features' && child) {
    const feature = nested === undefined ? child.replace(sourceExtension, '.ts') : child;
    return `features/${feature}`;
  }
  if (isCoreDirectory(entry)) return entry;
  if (child !== undefined) return undefined;
  return `${entry.replace(sourceExtension, '')}.ts`;
}

export function coreLayerImport(file, target) {
  const from = coreModule(file);
  const to = coreModule(target);
  return from && to && from !== to ? `${from} -> ${to}` : undefined;
}

function layer(module) {
  return layers.get(module.split('/')[0]) ?? composition;
}

function addEdge(graph, from, to) {
  if (!graph.has(from)) graph.set(from, new Set());
  graph.get(from).add(to);
}

function reaches(graph, start, target) {
  const pending = [start];
  const visited = new Set();
  while (pending.length) {
    const node = pending.pop();
    if (node === target) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    pending.push(...(graph.get(node) ?? []));
  }
  return false;
}

export function coreLayerInventory(importsByFile, previousFeedback = {}) {
  const weights = new Map(
    [...countsByRule(importsByFile)].map(([direction, files]) => [
      direction,
      [...files.values()].reduce((total, count) => total + count, 0),
    ]),
  );
  const directions = [...weights.keys()].sort();
  const upward = new Set();
  const peers = [];
  const graph = new Map();
  for (const direction of directions) {
    const [from, to] = direction.split(' -> ');
    const sourceTier = layer(from).tier;
    const targetTier = layer(to).tier;
    if (sourceTier < targetTier) upward.add(direction);
    if (sourceTier === targetTier) {
      peers.push({ direction, from, to });
      addEdge(graph, from, to);
    }
  }

  const cyclicPeers = peers.filter(({ from, to }) => reaches(graph, to, from));
  const cyclicImports = new Set(cyclicPeers.map(({ direction }) => direction));
  const previousCuts = new Set(
    Object.values(previousFeedback).flatMap((imports) => Object.keys(imports)),
  );
  const orderedPeers = cyclicPeers.toSorted(
    (left, right) =>
      Number(previousCuts.has(left.direction)) - Number(previousCuts.has(right.direction)) ||
      weights.get(right.direction) - weights.get(left.direction),
  );
  const retained = new Map();
  const feedbackEdges = new Set();
  for (const { direction, from, to } of orderedPeers) {
    if (reaches(retained, to, from)) feedbackEdges.add(direction);
    else addEdge(retained, from, to);
  }

  const inventory = {};
  for (const [section, selected] of Object.entries({ upward, feedbackEdges, cyclicImports })) {
    inventory[section] = {};
    for (const file of Object.keys(importsByFile).sort()) {
      const imports = Object.entries(importsByFile[file])
        .filter(([direction]) => selected.has(direction))
        .sort(([left], [right]) => (left < right ? -1 : left === right ? 0 : 1));
      if (imports.length) inventory[section][file] = Object.fromEntries(imports);
    }
  }
  return inventory;
}

export function describeCoreLayerGrowth(section, { rule, message }) {
  const [from, to] = rule.split(' -> ');
  const source = layer(from);
  const target = layer(to);
  if (section === 'upward') {
    return `Host core upward import (${source.name} tier ${source.tier} -> ${target.name} tier ${target.tier}): ${message}; move the dependency to a lower layer or use \`import type\` if only types are needed`;
  }
  return `Host core cycle (${source.name} tier ${source.tier}): ${message}; break the same-layer runtime cycle`;
}
