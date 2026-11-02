import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { MarketplaceClient } from './client.js';

export const MARKETPLACE_HOST_FILE = 'marketplace-host.json';
const HOST_ID = /^[A-Za-z0-9_-]{22,128}$/u;

export function ensureMarketplaceHostId(
  dataDir: string,
  createId: () => string = () => randomBytes(24).toString('base64url'),
): string {
  const file = join(dataDir, MARKETPLACE_HOST_FILE);
  try {
    const stored: unknown = JSON.parse(readFileSync(file, 'utf8'));
    const id = (stored as { hostId?: unknown } | null)?.hostId;
    if (typeof id === 'string' && HOST_ID.test(id)) return id;
  } catch {}
  const id = createId();
  try {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(file, `${JSON.stringify({ hostId: id })}\n`, { mode: 0o600 });
  } catch {}
  return id;
}

export interface InstallReceipts {
  send(listingId: string): Promise<void>;
}

export function createInstallReceipts(deps: {
  client: MarketplaceClient;
  dataDir: string;
  log?: (event: Record<string, string | number | boolean>) => void;
}): InstallReceipts {
  let hostId: string | undefined;
  return {
    async send(listingId) {
      const started = performance.now();
      try {
        hostId ??= ensureMarketplaceHostId(deps.dataDir);
        const result = await deps.client.installReceipt(listingId, hostId);
        deps.log?.({
          module: 'marketplace-receipt',
          phase: 'send',
          outcome: result.ok ? 'ok' : 'refused',
          durationMs: Math.round(performance.now() - started),
          ...(result.ok ? { counted: result.value.counted } : { reason: result.code }),
        });
      } catch {}
    },
  };
}
