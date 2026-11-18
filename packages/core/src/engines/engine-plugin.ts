import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CORE_MEMORY_FILE,
  DEFAULT_STANDING_LIMITS,
  SOUL_FILE,
  type StandingLimits,
} from '../memory/soul.js';

export function subscriptionEnginesAllowed(
  config: { subscriptionEngines?: boolean },
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  const kind = env['DEEPSEEKBOT_HOST_KIND']?.trim().toLowerCase();
  if (kind === 'cloud' || kind === 'vps') return false;
  return config.subscriptionEngines !== false;
}

function readLimited(path: string, limit: number): string | undefined {
  try {
    return readFileSync(path, 'utf8').slice(0, limit);
  } catch {
    return undefined;
  }
}

export function readEnginePersona(
  memoryDir: string | undefined,
  limits: StandingLimits = DEFAULT_STANDING_LIMITS,
): { soul?: string; coreMemory?: string } {
  if (memoryDir === undefined) return {};
  const soul = readLimited(join(memoryDir, SOUL_FILE), limits.soul);
  const coreMemory = readLimited(join(memoryDir, CORE_MEMORY_FILE), limits.coreMemory);
  return {
    ...(soul === undefined ? {} : { soul }),
    ...(coreMemory === undefined ? {} : { coreMemory }),
  };
}
