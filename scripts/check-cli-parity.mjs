#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { checkUiInventory, INVENTORY_PATH, readUiSurfaces } from './cli-ui-inventory.mjs';

const BASELINE = 'scripts/cli-parity-baseline.json';
const LABELS = { bridge: 'bridge method', routes: 'Host route', tools: 'Bot tool' };

export function bridgeMethodsFrom(rpcSource) {
  for (const match of rpcSource.matchAll(/\[\s*\n((?:\s*'[A-Za-z]+',\s*\n)+)\s*\]/g)) {
    const names = [...match[1].matchAll(/'([A-Za-z]+)'/g)].map((name) => name[1]);
    if (names.includes('sessions')) return names;
  }
  return [];
}

export function routePathsFrom(sources) {
  const paths = new Set();
  for (const source of sources)
    for (const match of source.matchAll(/path: '(\/api\/[^']+)'/g)) paths.add(match[1]);
  return [...paths];
}

export function botToolNamesFrom(grantExecutionSource) {
  const block = /const BOT_TOOL_NAMES = new Set\(\[([\s\S]*?)\]\)/.exec(grantExecutionSource);
  return block === null ? [] : [...block[1].matchAll(/'([a-z_]+)'/g)].map((name) => name[1]);
}

function runner(surface) {
  if (surface === 'cloud_work') return 'cloud-work';
  if (surface.startsWith('browser_')) return 'browser-tool';
  if (surface.startsWith('computer_')) return 'computer-tool';
  return 'bot-tool';
}

function covered(kind, surface, cliSource) {
  if (kind === 'routes') return cliSource.includes(surface);
  if (cliSource.includes(`'${surface}'`)) return true;
  return kind === 'tools' && cliSource.includes(`'${runner(surface)}'`);
}

function runnerExemption(kind, surface, reason, cliSource) {
  return (
    kind === 'tools' &&
    !cliSource.includes(`'${surface}'`) &&
    typeof reason === 'string' &&
    reason.trim() !== '' &&
    !/^#\d+$/.test(reason.trim())
  );
}

export function checkCliParity({ surfaces, cliSource, baseline }) {
  const errors = [];
  for (const kind of ['bridge', 'routes', 'tools']) {
    const label = LABELS[kind];
    const recorded = baseline[kind] ?? {};
    const present = new Set(surfaces[kind]);
    for (const surface of surfaces[kind]) {
      if (covered(kind, surface, cliSource) || Object.hasOwn(recorded, surface)) continue;
      errors.push(
        `${label} ${surface} has no deepseekbot command; add one, or record an exemption with a reason in ${BASELINE}`,
      );
    }
    for (const surface of Object.keys(recorded).sort()) {
      if (!present.has(surface))
        errors.push(`${label} ${surface} no longer exists; remove it from ${BASELINE}`);
      else if (
        covered(kind, surface, cliSource) &&
        !runnerExemption(kind, surface, recorded[surface], cliSource)
      )
        errors.push(`${label} ${surface} is covered by the CLI now; remove it from ${BASELINE}`);
      else if (typeof recorded[surface] !== 'string' || recorded[surface].trim() === '')
        errors.push(
          `${label} ${surface} needs an issue reference or exemption reason in ${BASELINE}`,
        );
    }
  }
  return errors;
}

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry)) files.push(path);
  }
  return files;
}

function main(root) {
  const read = (path) => readFileSync(join(root, path), 'utf8');
  const packages = readdirSync(join(root, 'packages')).map((name) =>
    join(root, 'packages', name, 'src'),
  );
  const hostSources = packages
    .filter((directory) => {
      try {
        return statSync(directory).isDirectory();
      } catch {
        return false;
      }
    })
    .flatMap(sourceFiles)
    .map((file) => readFileSync(file, 'utf8'));
  const cliDirectory = join(root, 'packages/core/src/bots');
  const cliSource = readdirSync(cliDirectory)
    .filter((name) => /^(cli.*|bot-create-cli)\.ts$/.test(name))
    .map((name) => readFileSync(join(cliDirectory, name), 'utf8'))
    .join('\n');
  const surfaces = {
    bridge: bridgeMethodsFrom(read('packages/core/src/bridge/rpc.ts')),
    routes: routePathsFrom(hostSources),
    tools: botToolNamesFrom(read('packages/core/src/workspaces/grant-execution.ts')),
  };
  const baseline = JSON.parse(read(BASELINE));
  const uiSurfaces = readUiSurfaces(root);
  const inventory = JSON.parse(read(INVENTORY_PATH));
  const errors = [
    ...checkCliParity({ surfaces, cliSource, baseline }),
    ...checkUiInventory(uiSurfaces, inventory, cliSource),
  ];
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`cli-parity ${error}\n`);
    process.exitCode = 1;
    return;
  }
  const total = surfaces.bridge.length + surfaces.routes.length + surfaces.tools.length;
  const open = Object.values(baseline).reduce(
    (sum, entries) => sum + Object.keys(entries).length,
    0,
  );
  process.stdout.write(
    `CLI parity holds: ${String(total - open)} of ${String(total)} bridge/route/tool surfaces have a deepseekbot command; ${String(open)} recorded in ${BASELINE}. ${uiSurfaces.length} supplemental UI/HTTP surfaces reviewed in ${INVENTORY_PATH} (includes tracked gaps, not full capability authorization).\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main(resolve(fileURLToPath(new URL('..', import.meta.url))));
