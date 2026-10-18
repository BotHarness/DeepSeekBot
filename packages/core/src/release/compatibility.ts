import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ReleaseRuntime {
  version: string;
  evaluate(
    manifest: object,
    exemptions: Record<string, readonly string[]>,
    version: string,
  ): { requirements: Record<string, string> } | undefined;
}

export type ReleaseCompatibility =
  | { status: 'compatible'; dshVersion: string }
  | {
      status: 'incompatible';
      dshVersion: string;
      package: string;
      requirements: Record<string, string>;
    }
  | {
      status: 'unknown';
      reason: 'runtime-unavailable' | 'metadata-unavailable';
      dshVersion?: string;
    };

export async function nativeReleaseRuntime(): Promise<ReleaseRuntime | undefined> {
  const entry = process.argv[1];
  if (entry === undefined || !isAbsolute(entry)) return undefined;
  try {
    const require = createRequire(realpathSync(entry));
    const boot = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')).href);
    if (
      typeof boot.getDshRuntimeVersion !== 'function' ||
      typeof boot.evaluatePluginCompatibility !== 'function'
    )
      return undefined;
    return { version: boot.getDshRuntimeVersion(), evaluate: boot.evaluatePluginCompatibility };
  } catch {
    return undefined;
  }
}

export function releaseMetadata(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function evaluateReleaseManifest(
  runtime: ReleaseRuntime,
  value: unknown,
  name: string,
  version: string,
): ReleaseCompatibility {
  const metadata = releaseMetadata(value);
  if (
    metadata?.['name'] !== name ||
    metadata['version'] !== version ||
    metadata['deprecated'] !== undefined
  )
    return { status: 'unknown', reason: 'metadata-unavailable', dshVersion: runtime.version };
  try {
    const mismatch = runtime.evaluate(metadata, {}, runtime.version);
    return mismatch === undefined
      ? { status: 'compatible', dshVersion: runtime.version }
      : {
          status: 'incompatible',
          dshVersion: runtime.version,
          package: name,
          requirements: mismatch.requirements,
        };
  } catch {
    return { status: 'unknown', reason: 'metadata-unavailable', dshVersion: runtime.version };
  }
}
