import { cpus, release, totalmem } from 'node:os';

export interface HostTelemetryFacts {
  pluginVersion?: string | undefined;
  dshVersion?: string | undefined;
  os: string;
  arch: string;
  nodeVersion: string;
  osRelease: string;
  cpuCount: number;
  totalMemory: number;
}

export function readHostTelemetryFacts(
  pluginVersion?: string,
  dshVersion?: string,
): HostTelemetryFacts {
  return {
    pluginVersion,
    dshVersion,
    os: process.platform,
    arch: process.arch,
    nodeVersion: process.versions.node,
    osRelease: release(),
    cpuCount: cpus().length,
    totalMemory: totalmem(),
  };
}

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const version = (value: string | undefined) =>
  value !== undefined && VERSION.test(value) ? value : 'unknown';
const major = (value: string) => /^(\d{1,3})(?:\.|$)/u.exec(value)?.[1] ?? 'unknown';
const member = (value: string, allowed: string[]) => (allowed.includes(value) ? value : 'unknown');

export function cpuCountBucket(count: number): string {
  if (!Number.isInteger(count) || count <= 0) return 'unknown';
  return count <= 2
    ? '1-2'
    : count <= 4
      ? '3-4'
      : count <= 8
        ? '5-8'
        : count <= 16
          ? '9-16'
          : '17plus';
}

export function totalMemoryBucket(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'unknown';
  const gb = bytes / 1024 ** 3;
  return gb <= 4 ? '<=4' : gb <= 8 ? '8' : gb <= 16 ? '16' : gb <= 32 ? '32' : '64plus';
}

export function hostContextProperties(facts: HostTelemetryFacts): Record<string, string> {
  return {
    app_version: version(facts.pluginVersion),
    dsh_version: version(facts.dshVersion),
    os: member(facts.os, [
      'aix',
      'darwin',
      'freebsd',
      'linux',
      'openbsd',
      'sunos',
      'win32',
      'android',
      'netbsd',
    ]),
    arch: member(facts.arch, [
      'arm',
      'arm64',
      'ia32',
      'loong64',
      'mips',
      'mipsel',
      'ppc',
      'ppc64',
      'riscv64',
      's390',
      's390x',
      'x64',
    ]),
    node_version: major(facts.nodeVersion),
    os_release_major: major(facts.osRelease),
    cpu_count_bucket: cpuCountBucket(facts.cpuCount),
    total_mem_gb_bucket: totalMemoryBucket(facts.totalMemory),
  };
}
