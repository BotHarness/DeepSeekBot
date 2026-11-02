import { readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isReleaseVersion } from './version.js';
import { releaseComponentNames, type LoadedReleaseComponent } from './component.js';

export type ReleaseIdentityFailure =
  | 'metadata-missing'
  | 'metadata-invalid'
  | 'composition-unverified'
  | 'component-mismatch';

export type ReleaseIdentity =
  | { kind: 'development'; source?: { revision: string; dirty: boolean } }
  | { kind: 'release'; version: string }
  | { kind: 'unknown'; reason: ReleaseIdentityFailure };

declare const __BOTHARNESS_SOURCE__: { revision: string; dirty: boolean } | null;

function developmentIdentity(moduleUrl: string): ReleaseIdentity {
  try {
    const root = fileURLToPath(new URL('../../../', moduleUrl));
    const manifest = manifestAt(join(root, 'package.json'));
    if (
      manifest['name'] !== 'botharness' ||
      manifest['private'] !== true ||
      realpathSync(join(root, 'packages/core')) !==
        realpathSync(fileURLToPath(new URL('../', moduleUrl)))
    ) {
      return { kind: 'unknown', reason: 'metadata-invalid' };
    }
    const git = (args: string[]): string =>
      execFileSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        timeout: 2_000,
        maxBuffer: 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    if (realpathSync(git(['rev-parse', '--show-toplevel'])) !== realpathSync(root)) {
      return { kind: 'unknown', reason: 'metadata-invalid' };
    }
    const source =
      typeof __BOTHARNESS_SOURCE__ === 'undefined'
        ? moduleUrl.endsWith('.ts')
          ? {
              revision: git(['rev-parse', 'HEAD']),
              dirty: git(['status', '--porcelain', '--untracked-files=normal']).length > 0,
            }
          : null
        : __BOTHARNESS_SOURCE__;
    return source !== null &&
      /^[a-f0-9]{40}$/u.test(source.revision) &&
      typeof source.dirty === 'boolean'
      ? { kind: 'development', source }
      : { kind: 'unknown', reason: 'metadata-invalid' };
  } catch {
    return { kind: 'unknown', reason: 'metadata-invalid' };
  }
}

const COMPONENTS = Object.values(releaseComponentNames);

function manifestAt(filename: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(filename, 'utf8'));
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('invalid manifest');
  return value as Record<string, unknown>;
}

export function captureReleaseComposition(
  core: ReleaseIdentity,
  moduleUrl: string,
  anchors: readonly string[] = [],
): (loaded: readonly LoadedReleaseComponent[]) => ReleaseIdentity {
  const refuse =
    (reason: ReleaseIdentityFailure): (() => ReleaseIdentity) =>
    () => ({ kind: 'unknown', reason });
  if (core.kind !== 'release') return () => core;
  let productPath: string | undefined;
  for (const anchor of anchors) {
    try {
      productPath = createRequire(anchor).resolve('deepseekbot/package.json');
      break;
    } catch {
      continue;
    }
  }
  if (productPath === undefined) return refuse('composition-unverified');
  try {
    const product = manifestAt(productPath);
    if (
      product['name'] !== 'deepseekbot' ||
      product['version'] !== core.version ||
      product['private'] === true
    ) {
      return refuse('component-mismatch');
    }
    const dependencies = product['dependencies'];
    if (typeof dependencies !== 'object' || dependencies === null || Array.isArray(dependencies)) {
      return refuse('component-mismatch');
    }
    const resolve = createRequire(productPath);
    const directories = new Map<string, string>();
    for (const name of COMPONENTS) {
      const filename = resolve.resolve(`${name}/package.json`);
      const component = manifestAt(filename);
      if (
        component['name'] !== name ||
        component['version'] !== core.version ||
        component['private'] === true ||
        (dependencies as Record<string, unknown>)[name] !== core.version
      ) {
        return refuse('component-mismatch');
      }
      if (
        name === '@botharness/core' &&
        realpathSync(dirname(filename)) !== realpathSync(fileURLToPath(new URL('../', moduleUrl)))
      ) {
        return refuse('component-mismatch');
      }
      directories.set(name, realpathSync(dirname(filename)));
    }
    return (loaded) => {
      for (const name of COMPONENTS) {
        const matches = loaded.filter((component) => component.name === name);
        if (matches.length === 0) return { kind: 'unknown', reason: 'composition-unverified' };
        if (
          matches.length !== 1 ||
          matches[0]!.version !== core.version ||
          matches[0]!.private ||
          matches[0]!.directory !== directories.get(name)
        ) {
          return { kind: 'unknown', reason: 'component-mismatch' };
        }
      }
      return core;
    };
  } catch {
    return refuse('component-mismatch');
  }
}

export function readReleaseIdentity(moduleUrl: string): ReleaseIdentity {
  let bytes: string;
  try {
    bytes = readFileSync(new URL('../package.json', moduleUrl), 'utf8');
  } catch {
    return { kind: 'unknown', reason: 'metadata-missing' };
  }
  try {
    const manifest = JSON.parse(bytes) as Record<string, unknown>;
    if (manifest['name'] !== '@botharness/core') {
      return { kind: 'unknown', reason: 'metadata-invalid' };
    }
    if (manifest['private'] === true && manifest['version'] === '0.0.0') {
      return developmentIdentity(moduleUrl);
    }
    const version = manifest['version'];
    return typeof version === 'string' && isReleaseVersion(version)
      ? { kind: 'release', version }
      : { kind: 'unknown', reason: 'metadata-invalid' };
  } catch {
    return { kind: 'unknown', reason: 'metadata-invalid' };
  }
}
