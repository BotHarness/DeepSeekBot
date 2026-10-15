import { execFileSync } from 'node:child_process';
import { existsSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readMemoryDocument } from './files.js';

export const SOUL_FILE = 'SOUL.md';
export const LEGACY_SOUL_FILE = 'PERSONA.md';
export const CORE_MEMORY_FILE = 'MEMORY.md';
export const STANDING_FILES: readonly string[] = [SOUL_FILE, LEGACY_SOUL_FILE, CORE_MEMORY_FILE];

export interface StandingLimits {
  soul: number;
  coreMemory: number;
}

export const DEFAULT_STANDING_LIMITS: StandingLimits = { soul: 5000, coreMemory: 3000 };
export const MIN_STANDING_LIMIT = 500;
export const MAX_STANDING_LIMIT = 50_000;

export function isStandingLimit(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_STANDING_LIMIT &&
    value <= MAX_STANDING_LIMIT
  );
}

export function isStandingLimits(value: unknown): value is StandingLimits {
  if (typeof value !== 'object' || value === null) return false;
  const limits = value as Record<string, unknown>;
  return isStandingLimit(limits['soul']) && isStandingLimit(limits['coreMemory']);
}

export const CORE_MEMORY_TEMPLATE = `# Core Memory

This file is your Core Memory. It is part of your system prompt at the start of every Session, so you begin each conversation knowing what you remember without searching for it. Keep it short: mostly pointers to the Memory files that hold the details, plus the few facts you should never forget. How it is organized is something you and the people you work with settle over time.
`;

const SOUL_MIGRATION_COMMIT_MESSAGE = 'Rename PERSONA.md to SOUL.md (ADR-0134)\n\nsource=system\n';

function readBody(root: string, file: string): string | undefined {
  return readMemoryDocument(root, file)?.body;
}

export function readSoulBody(root: string): { file: string; body: string } | undefined {
  for (const file of [SOUL_FILE, LEGACY_SOUL_FILE]) {
    const body = readBody(root, file);
    if (body !== undefined) return { file, body };
  }
  return undefined;
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

export interface StandingUsage {
  path: string;
  role: 'soul' | 'coreMemory';
  chars: number;
  limit: number;
}

function characterCount(body: string): number {
  return [...body.trimEnd()].length;
}

export function standingUsage(
  root: string,
  limits: StandingLimits = DEFAULT_STANDING_LIMITS,
): StandingUsage[] {
  const usage: StandingUsage[] = [];
  const soul = readSoulBody(root);
  if (soul !== undefined) {
    usage.push({
      path: soul.file,
      role: 'soul',
      chars: characterCount(soul.body),
      limit: limits.soul,
    });
  }
  const coreMemory = readBody(root, CORE_MEMORY_FILE);
  if (coreMemory !== undefined) {
    usage.push({
      path: CORE_MEMORY_FILE,
      role: 'coreMemory',
      chars: characterCount(coreMemory),
      limit: limits.coreMemory,
    });
  }
  return usage;
}

function renderSection(title: string, file: string, body: string, limit: number): string {
  const characters = [...body.trimEnd()];
  const count = characters.length;
  const percent = Math.round((count / limit) * 100);
  const header = `## ${title} (${file}) [${percent}% — ${formatCount(count)}/${formatCount(limit)} chars]`;
  if (count <= limit) return `${header}\n\n${characters.join('')}`;
  return `${header}\n\n${characters.slice(0, limit).join('')}\n\n[Truncated: ${file} has ${formatCount(count)} characters, over its ${formatCount(limit)}-character limit. Consolidate it below the limit; the full file is still on disk.]`;
}

export function renderStandingPrompt(
  root: string,
  limits: StandingLimits = DEFAULT_STANDING_LIMITS,
): string {
  const sections: string[] = [];
  const soul = readSoulBody(root);
  if (soul !== undefined && soul.body.trim().length > 0) {
    sections.push(renderSection('Soul', soul.file, soul.body, limits.soul));
  }
  const coreMemory = readBody(root, CORE_MEMORY_FILE);
  if (coreMemory !== undefined && coreMemory.trim().length > 0) {
    sections.push(renderSection('Core Memory', CORE_MEMORY_FILE, coreMemory, limits.coreMemory));
  }
  return sections.join('\n\n');
}

function git(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function configured(root: string, key: string): boolean {
  try {
    return git(root, ['config', '--get', key]).trim().length > 0;
  } catch {
    return false;
  }
}

function identityFallback(root: string): string[] {
  return [
    ...(configured(root, 'user.name') ? [] : ['-c', 'user.name=BotHarness']),
    ...(configured(root, 'user.email') ? [] : ['-c', 'user.email=bot@botharness.local']),
  ];
}

export type SoulMigrationResult = 'unchanged' | 'renamed' | 'committed' | 'blocked';

export function migrateLegacySoul(root: string): SoulMigrationResult {
  const legacy = join(root, LEGACY_SOUL_FILE);
  if (!existsSync(legacy) || existsSync(join(root, SOUL_FILE))) return 'unchanged';
  if (!existsSync(join(root, '.git'))) {
    renameSync(legacy, join(root, SOUL_FILE));
    return 'renamed';
  }
  if (git(root, ['ls-files', '--', LEGACY_SOUL_FILE]).trim().length === 0) {
    renameSync(legacy, join(root, SOUL_FILE));
    return 'renamed';
  }
  if (git(root, ['status', '--porcelain', '--', LEGACY_SOUL_FILE]).trim().length > 0) {
    return 'blocked';
  }
  git(root, ['mv', '--', LEGACY_SOUL_FILE, SOUL_FILE]);
  git(root, [
    ...identityFallback(root),
    'commit',
    '--no-gpg-sign',
    '-m',
    SOUL_MIGRATION_COMMIT_MESSAGE,
    '--',
    LEGACY_SOUL_FILE,
    SOUL_FILE,
  ]);
  return 'committed';
}

export function migrateLegacySouls(
  registry: {
    list(): Array<{ slug: string }>;
    memoryDirFor(slug: string): string | undefined;
  },
  warn?: (message: string) => void,
): void {
  const startedAt = performance.now();
  const counts: Record<SoulMigrationResult | 'failed', number> = {
    unchanged: 0,
    renamed: 0,
    committed: 0,
    blocked: 0,
    failed: 0,
  };
  let records: Array<{ slug: string }>;
  try {
    records = registry.list();
  } catch {
    return;
  }
  for (const record of records) {
    const memoryDir = registry.memoryDirFor(record.slug);
    if (memoryDir === undefined) continue;
    try {
      counts[migrateLegacySoul(memoryDir)] += 1;
    } catch {
      counts.failed += 1;
    }
  }
  if (counts.renamed + counts.committed + counts.blocked + counts.failed > 0) {
    warn?.(
      `soul-migration initiator=host-startup committed=${counts.committed} renamed=${counts.renamed} blocked=${counts.blocked} failed=${counts.failed} durationMs=${Math.round(performance.now() - startedAt)}`,
    );
  }
}

function writeIfAbsent(path: string, text: string): boolean {
  try {
    writeFileSync(path, text, { encoding: 'utf8', flag: 'wx' });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return false;
  }
}

export function seedStandingFiles(
  root: string,
  options: { soul?: string; coreMemory?: string; coreMemoryTemplate: boolean },
): string[] {
  const written: string[] = [];
  const soul = options.soul;
  if (
    soul !== undefined &&
    soul.trim().length > 0 &&
    !existsSync(join(root, LEGACY_SOUL_FILE)) &&
    writeIfAbsent(join(root, SOUL_FILE), soul)
  ) {
    written.push(SOUL_FILE);
  }
  const coreMemory = options.coreMemory?.trim() ? options.coreMemory : undefined;
  if (
    (coreMemory !== undefined || options.coreMemoryTemplate) &&
    writeIfAbsent(join(root, CORE_MEMORY_FILE), coreMemory ?? CORE_MEMORY_TEMPLATE)
  ) {
    written.push(CORE_MEMORY_FILE);
  }
  return written;
}
