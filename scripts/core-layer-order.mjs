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
  const [entry, child] = path.slice(CORE_SOURCE.length + 1).split('/');
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
  return layers.get(module) ?? composition;
}

export function coreLayerInventory(importsByFile) {
  const directions = new Set(
    Object.values(importsByFile).flatMap((imports) => Object.keys(imports)),
  );
  const upward = new Set();
  const peerCycles = new Set();
  for (const direction of directions) {
    const [from, to] = direction.split(' -> ');
    const sourceTier = layer(from).tier;
    const targetTier = layer(to).tier;
    if (sourceTier < targetTier) upward.add(direction);
    if (sourceTier === targetTier && directions.has(`${to} -> ${from}`)) peerCycles.add(direction);
  }

  const inventory = { upward: {}, peerCycles: {} };
  for (const [file, imports] of Object.entries(importsByFile)) {
    const entries = Object.entries(imports);
    const upwardImports = entries.filter(([direction]) => upward.has(direction));
    const cycleImports = entries.filter(([direction]) => peerCycles.has(direction));
    if (upwardImports.length) inventory.upward[file] = Object.fromEntries(upwardImports);
    if (cycleImports.length) inventory.peerCycles[file] = Object.fromEntries(cycleImports);
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
  const pair = [from, to].sort().join(' <-> ');
  return `Host core mutual peer cycle (${source.name} tier ${source.tier}, ${pair}): ${message}; remove a runtime dependency in one direction`;
}
